// server.js

const express = require('express');
const fetch = require('node-fetch'); // For making HTTP requests in Node
const cors = require('cors'); // To handle CORS for our own server if needed
require('dotenv').config();

// 2. Setup the Express app
const app = express();
const PORT = 8123;

// 3. Middleware
app.use(express.json());
app.use(cors());

// Serve static files (index.html, css, js) from a 'public' folder
app.use(express.static('public')); 

/**
 * Fetches all fields from Jira to find the specific custom field ID for Story Points.
 */
async function getStoryPointFieldId(jiraUrl, headers) {
    const fieldUrl = `${jiraUrl}/rest/api/3/field`;
    try {
        const response = await fetch(fieldUrl, { headers });
        if (!response.ok) {
            console.log("Warning: Could not fetch Jira fields to find Story Point ID. Displayed size for each story will be set to 1.");
            return null;
        }
        const fields = await response.json();
        // Find the story point field. Tries 'Story Points' and 'Story Point Estimate'.
        const storyPointField = fields.find(field =>
            field.custom && (field.name.toUpperCase() === 'STORY POINTS' || field.name.toUpperCase() === 'STORY POINT ESTIMATE')
        );
        return storyPointField ? storyPointField.id : null;
    } catch (error) {
        console.error("Error trying to find Story Point field:", error);
        return null;
    }
}

/**
 * Helper function to execute a Jira search query.
 * Dynamically includes the story point field in the request.
 */
async function executeJiraSearch(jql, storyPointFieldId, jiraUrl, headers) {
    const searchUrl = `${jiraUrl}/rest/api/3/search/jql`;
    
    // Base fields we always want
    const requestFields = ["summary", "status", "issuetype", "assignee", "issuelinks", "parent"];
    // Dynamically add the story point field if it was found
    if (storyPointFieldId) {
        requestFields.push(storyPointFieldId);
    }
    
    try {
        const apiResponse = await fetch(searchUrl, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify({
                jql: jql,
                fields: requestFields,
                maxResults: 100 
            })
        });

        const data = await apiResponse.json();
        return { ok: apiResponse.ok, status: apiResponse.status, data };
    } catch (error) {
        return { ok: false, status: 500, data: { error: 'Proxy to Jira fetch failed', details: error } };
    }
}


// 4. The Proxy Route
app.post('/api/jira', async (req, res) => {
    const { jiraUrl, email, apiToken, epicKeys } = req.body;

    if (!jiraUrl || !email || !apiToken || !epicKeys) {
        return res.status(400).json({ error: 'Missing required Jira credentials or Epic Key.' });
    }

    const headers = {
        'Authorization': `Basic ${Buffer.from(`${email}:${apiToken}`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Accept': 'application/json'
    };

    try {
        // First, find the story point field ID for the Jira instance.
        const storyPointFieldId = await getStoryPointFieldId(jiraUrl, headers);
        if (storyPointFieldId) {
             console.log(`Discovered Story Point Field ID: ${storyPointFieldId}`);
        } else {
             console.log("Could not find a Story Point field. Nodes will not be sized by points.");
        }

        const epicKeysJQL = epicKeys.map(key => `"${key}"`).join(', ');
        
        // Try Team-Managed JQL
        const jqlTeamManaged = `parent in (${epicKeysJQL}) OR key in (${epicKeysJQL})`;
        let result = await executeJiraSearch(jqlTeamManaged, storyPointFieldId, jiraUrl, headers);
        
        if (result.ok && result.data.issues && result.data.issues.length > 1) {
            // Return the issues AND the field ID that was found
            console.log("Using Team-Managed JQL results.");
            return res.status(200).json({ issues: result.data.issues, storyPointFieldId: storyPointFieldId });
        }
        
        // Try Company-Managed JQL
        const jqlCompanyManaged = `'Epic Link' in (${epicKeysJQL}) OR key in (${epicKeysJQL})`;
        result = await executeJiraSearch(jqlCompanyManaged, storyPointFieldId, jiraUrl, headers);
        
        if (result.ok) {
            // Return the issues AND the field ID that was found
            console.log("Using Company-Managed JQL results.");
            return res.status(200).json({ issues: result.data.issues, storyPointFieldId: storyPointFieldId });
        } else {
            const errorMessage = result.data.errorMessages ? result.data.errorMessages.join(' ') : JSON.stringify(result.data);
            return res.status(result.status).json({ error: `Jira API Error: ${errorMessage}` });
        }

    } catch (error) {
        console.error('Proxy server error:', error);
        res.status(500).json({ error: 'An unexpected error occurred in the proxy server.' });
    }
});


// 5. Start the server
app.listen(PORT, () => {
    console.log(`Server is running at http://localhost:${PORT}`);
});
