// Load environment variables from a .env file for local development
if (process.env.NODE_ENV !== 'production') {
    require('dotenv').config();
}

const crypto = require('crypto')
const express = require('express');
const fetch = require('node-fetch');
const session = require('express-session');
const admin = require('firebase-admin');
const { Firestore } = require('@google-cloud/firestore');
const { FirestoreStore } = require('@google-cloud/connect-firestore');

// Initialize Firebase Admin SDK. It will automatically use the project's credentials when deployed.
admin.initializeApp();

const firestore = new Firestore();

const app = express();
const port = process.env.PORT || 8000;

// --- Jira OAuth 2.0 (3LO) Credentials ---
// For production, these are set via `firebase functions:secrets:set <name>` For local dev, they are in `.env`.
const CLIENT_ID = process.env.CLIENT_ID;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const SESSION_SECRET = process.env.SESSION_SECRET;

// Use the production URI from env vars if available, otherwise default to localhost
const REDIRECT_URI = process.env.PROD_REDIRECT_URI || `http://localhost:${port}/auth/callback`;
const HOSTING_URL = process.env.HOSTING_URL || '/';

// Add a check for missing configuration
if (!CLIENT_ID || !CLIENT_SECRET || !SESSION_SECRET) {
    console.error("CRITICAL: Missing Jira OAuth credentials. Ensure they are set in your .env file or Firebase runtime config.");
}

app.set('trust proxy', 1); 

// Determine if the app is running in a production environment. This reads the NODE_ENV variable.
const isProduction = process.env.NODE_ENV === 'production';

// Use express-session to store tokens securely on the server
app.use(session({
    store: new FirestoreStore({
        dataset: firestore,
        kind: 'sessions'
    }),
    secret: SESSION_SECRET,
    resave: false,
    saveUninitialized: false, // Don't save session until something is stored.
    cookie: { 
        secure: isProduction,
        sameSite: 'lax',
        httpOnly: true
    }
}));

app.use(express.json());

// === ROUTE DEFINITIONS ===

const authRouter = express.Router();
authRouter.get('/login', (req, res) => {
    if (!CLIENT_ID) {
        return res.status(500).send("Server configuration error: Missing Client ID.");
    }
    
    const oauthState = crypto.randomBytes(16).toString('hex');
    req.session.oauthState = oauthState;

//    req.session.regenerate((err) => {
//        if (err) {
//            console.error("Session regeneration error:", err);
//            return res.status(500).send("Could not initiate login session.");
//        }

    console.log({
        Message: "Session state prior to login",
        SessionID: req.sessionID,
        OAuthState: req.session.oauthState 
    })

    req.session.save((saveErr) => {
        if (saveErr) {
            console.error("Session save error on login:", saveErr);
            return res.status(500).send("Could not initiate login session.");
        }
        const authUrl = `https://auth.atlassian.com/authorize?` +
            `audience=api.atlassian.com&` +
            `client_id=${CLIENT_ID}&` +
            `scope=read:jira-work&` +
            `redirect_uri=${REDIRECT_URI}&` +
            `state=${oauthState}&` +
            `response_type=code&` +
            `prompt=consent`;
        res.redirect(authUrl);
    });
});
//});

authRouter.get('/callback', async (req, res) => {
    const code = req.query.code;
    const receivedState = req.query.state;
    const expectedState = req.session.oauthState;

    console.log({
        message: "Received OAuth callback",
        receivedState: receivedState,
        expectedState: expectedState,
        actualSessionId: req.sessionID
    });

    // Security check
    if (receivedState !== expectedState) {
        return res.status(403).send("Invalid state parameter. Authentication rejected.");
    }

    req.session.oauthState = null

    try {
        const response = await fetch('https://auth.atlassian.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'authorization_code',
                client_id: CLIENT_ID,
                client_secret: CLIENT_SECRET,
                code: code,
                redirect_uri: REDIRECT_URI,
            }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`);
        
        req.session.accessToken = data.access_token;
        req.session.refreshToken = data.refresh_token;

        // Explicitly save the session before redirecting to prevent race conditions.
        req.session.save((err) => {
            if (err) {
                console.error("Session save error:", err);
                return res.status(500).send('Failed to save session.');
            }
            // Only redirect AFTER the session has been successfully saved.
            res.redirect(HOSTING_URL);
        });

    } catch (error) {
        console.error('Error in OAuth callback:', error);
        res.status(500).send(`
            <body style="font-family: sans-serif; padding: 2em;">
                <h1>Authentication Failed</h1>
                <p>There was an error during the token exchange with Atlassian.</p>
                <p><strong>Error Details:</strong></p>
                <pre style="background-color: #eee; padding: 1em; border-radius: 5px;">${error.message}</pre>
            </body>
        `);
    }
});

authRouter.get('/status', (req, res) => {
    res.json({ loggedIn: !!req.session.accessToken });
});

authRouter.get('/logout', (req, res) => {
    req.session.destroy((err) => {
        if (err) {
            return console.error("Failed to destroy session:", err);
        }
        res.redirect(HOSTING_URL);
    });
});

// Mount the authentication router under the /api/auth prefix
app.use('/api/auth', authRouter);

// Helper function for making authenticated requests to the Jira API
async function runJiraSearch(jql, accessToken, searchUrl) {
    const fields = `summary,status,issuetype,assignee,issuelinks,parent,created,resolutiondate,customfield_10016`;
    const response = await fetch(searchUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify({ jql, fields: fields.split(','), maxResults: 100 })
    });
    return response.json();
}

app.post('/api/jira', async (req, res) => {
    if (!req.session.accessToken) {
        return res.status(401).json({ error: 'Not authenticated. Please log in.' });
    }
    const { epicKey } = req.body;
    if (!epicKey) {
        return res.status(400).json({ error: 'Epic Key is required.' });
    }
    try {
        const cloudIdResponse = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
            headers: { 'Authorization': `Bearer ${req.session.accessToken}` },
        });
        const resources = await cloudIdResponse.json();
        if (!resources || resources.length === 0) {
            return res.status(404).json({ error: 'No Jira sites found for this user.' });
        }
        const cloudId = resources[0].id;
        const jiraUrl = resources[0].url;
        const searchUrl = `https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3/search`;

        const jqlTeam = `parent = "${epicKey}" OR key = "${epicKey}"`;
        let result = await runJiraSearch(jqlTeam, req.session.accessToken, searchUrl);

        if (!result.issues || result.issues.length <= 1) {
            const jqlCompany = `'Epic Link' = "${epicKey}" OR key = "${epicKey}"`;
            result = await runJiraSearch(jqlCompany, req.session.accessToken, searchUrl);
        }

        if (result.errorMessages) throw new Error(`Jira API Error: ${result.errorMessages.join(' ')}`);

        res.json({ issues: result.issues || [], jiraUrl });
    } catch (error) {
        console.error('API Proxy Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Start the server only when this file is run directly (for local testing)
if (require.main === module) {
    app.listen(port, () => {
        console.log(`Server running at http://localhost:${port}`);
    });
}

// Export the app for Firebase Functions
module.exports = app;
