const { onRequest } = require("firebase-functions/v2/https");

// Import Express app from the root directory.
const server = require("./server");

// Export the server as a v2 cloud function named 'api'.
// The `runWith` options explicitly grant this function access to the specified secrets.
// Without this, process.env will not be populated with your secret values.
exports.api = onRequest(
    {
        secrets: [
            "CLIENT_ID",
            "CLIENT_SECRET",
            "SESSION_SECRET",
            "PROD_REDIRECT_URI",
            "HOSTING_URL"
        ]
    },
    server
);
