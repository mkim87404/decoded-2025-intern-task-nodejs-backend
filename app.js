// Conditionally load environment variables (don't need dotenv package on Render production)
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) { require('dotenv').config(); }
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Ajv = require('ajv');
const app = express();
const PORT = process.env.PORT || 3001;

// Prevent the Backend axios requests from hanging indefinitely
const AXIOS_REQUEST_TIMEOUT = Number(process.env.AXIOS_REQUEST_TIMEOUT) || 35000; // Use fallback timeout if no environment variable set

// Use fallback AI API request retry threshold count if not found from environment variable
const AI_API_RETRY_THRESHOLD = Number(process.env.AI_API_RETRY_THRESHOLD || 2);
// Parse an array of compatible AI models from the environment variable (comma separated AI model names)
const AI_MODEL_POOL = process.env.AI_MODEL_POOL ? process.env.AI_MODEL_POOL.split(',').map(name => ({ name: name.trim(), failCount: 0 })) : [];

// Middleware for CORS whitelisting
const CORS_ALLOWED_REQUEST_ORIGINS = process.env.CORS_ALLOWED_REQUEST_ORIGINS ? process.env.CORS_ALLOWED_REQUEST_ORIGINS.split(',').map(origin => origin.trim()) : [];
const DEV_GITHUB_CODESPACES_SUBDOMAIN = process.env.DEV_GITHUB_CODESPACES_SUBDOMAIN; // For testing

app.use(cors({
  origin: function (origin, callback) {
    if (
      CORS_ALLOWED_REQUEST_ORIGINS.includes(origin) ||
      (DEV_GITHUB_CODESPACES_SUBDOMAIN && origin && origin.startsWith(`https://${DEV_GITHUB_CODESPACES_SUBDOMAIN}`) && origin.endsWith('.app.github.dev'))
    ) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  }
}));

// Middleware to parse inbound requests in JSON
app.use(express.json());  // express.json() middleware internally uses next(err) when it encounters a parsing error.

// Create AJV validator using my JSON schema definition for the AI's response
const validate = (new Ajv()).compile(
  {
    type: "object",
    properties: {
      "App Name": { type: "string" },
      "Roles": {
        type: "array",
        items: {
          type: "object",
          properties: {
            "Role": { type: "string" },
            "Features": {
              type: "array",
              items: {
                type: "object",
                properties: {
                  "Feature": { type: "string" },
                  "Entity": { type: "string" },
                  "Input Fields": {
                    type: "array",
                    items: { type: "string" }
                  },
                  "Buttons": {
                    type: "array",
                    items: { type: "string" }
                  }
                },
                required: ["Feature", "Entity", "Input Fields", "Buttons"],
                additionalProperties: false
              }
            }
          },
          required: ["Role", "Features"],
          additionalProperties: false
        }
      }
    },
    required: ["App Name", "Roles"],
    additionalProperties: false
  }
);

// Helper function to select the next available AI model (pick the model with the lowest consecutive fail count)
function getAvailableModel() {
  if (AI_MODEL_POOL.length === 0) return null;

  return AI_MODEL_POOL.reduce((minModel, currentModel) => {
    return currentModel.failCount < minModel.failCount ? currentModel : minModel;
  }, AI_MODEL_POOL[0]);
}

// API route - Extract & Return app requirements using an AI API
app.post('/extract', async (req, res, next) => {
  try {
    // Return a dummy JSON response when testing from Github Codespace's local preview domain
    const origin = req.get('Origin') || req.get('Referer');
    if (
      DEV_GITHUB_CODESPACES_SUBDOMAIN
      && origin
      && origin.startsWith(`https://${DEV_GITHUB_CODESPACES_SUBDOMAIN}`)
      && origin.endsWith('.app.github.dev')
    ) {
      const dummyResponses = {
        small: { 
          "App Name" : "SmallApp",
          "Roles" : []
        },
        big: {
          "App Name": "BigApp",
          "Roles": [
            {
              "Role": "User",
              "Features": [
                {
                  "Feature": "Create Post",
                  "Entity": "Post",
                  "Input Fields": ["Title", "Content", "Tags", "Image Upload", "Privacy Settings", "Location", "Scheduled Time"],
                  "Buttons": ["Submit", "Save Draft", "Cancel", "Add Image", "Tag Friends", "Set Location"]
                },
                {
                  "Feature": "Comment on Post",
                  "Entity": "Comment",
                  "Input Fields": ["Comment Text", "Emoji Reactions"],
                  "Buttons": ["Post Comment", "Edit Comment", "Delete Comment", "Like Comment"]
                }
              ]
            },
            {
              "Role": "Admin",
              "Features": [
                {
                  "Feature": "Invite Users",
                  "Entity": "User",
                  "Input Fields": ["Username", "Email", "Role", "Invite Date", "Invitation Message", "Expiration Date", "Status", "Resend Count"],
                  "Buttons": ["Send Invite", "Resend Invite", "Cancel Invite", "View Invite Status", "Filter Invites", "Sort Invites"]
                },
                {
                  "Feature": "Manage Users",
                  "Entity": "User",
                  "Input Fields": ["Username"],
                  "Buttons": ["Add", "Delete"]
                },
                {
                  "Feature": "Reward Users",
                  "Entity": "User",
                  "Input Fields": ["Username", "Email", "Reward Type", "Reward Amount", "Reward Date", "Reward Reason"],
                  "Buttons": ["Give Reward", "Delete Reward", "View Rewards", "Edit Reward", "Filter Rewards", "Sort Rewards"]
                }
              ]
            }
          ]
        }
      };
      
      return res.json(req.body?.description?.trim() === 'small' ? dummyResponses.small : dummyResponses.big);
    }

    // Validate the user input before invoking the AI API
    const userInput = req.body.description;
    if (!userInput || typeof userInput !== 'string' || userInput.trim() === '') {
      const error = new Error('Missing or invalid app description');
      error.status = 400;
      throw error;
    }
    const prompt = `Given a description of an app, first extract a list called "Roles" containing all agents that perform an action on this app, and for each "Role", devise a sublist called "Features" containing all functionalities of the app performed by the "Role". Each "Feature" will be implemented as a dedicated form on the app, so for each "Feature", devise 2 sublists called "Input Fields" and "Buttons" containing all relevant input fields and buttons that could go on the feature's form, respectively. Then, for each "Feature", include a property called "Entity" by deducing the most appropriate entity that is being acted upon on the feature's form, where this "Entity" will subsequently change state, and the app will typically keep track of this "Entity" through database tables. Finally, return a single JSON Object containing a property named "App Name", giving it an appropriate value considering the overall theme of the app, and a property named "Roles" which is the completed "Roles" list in its nested form. Your response must be a single valid JSON object matching the following JSON schema structure precisely { "App Name": string, "Roles": [ { "Role": string, "Features": [ { "Feature": string, "Entity": string, "Input Fields": [string], "Buttons": [string] } ] } ] } All key names must match exactly in spelling and capitalization and spacing. Do not include any explanation, markdown or formatting in your response. Do not wrap the entire response in quotes.
    App Description: """${userInput}"""`;

    let response;

    for (let i = 0; i < AI_API_RETRY_THRESHOLD; i++) {
      const aiModel = getAvailableModel();
      if (!aiModel) throw new Error('No AI Model found from environment variables.');

      try {
        response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
          model: aiModel.name, // process.env.AI_MODEL, // use this if need to fix the AI Model
          messages: [{ role: 'user', content: prompt }]
        }, {
          headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
          timeout: AXIOS_REQUEST_TIMEOUT
        });

        // Successfully fetched an AI response
        aiModel.failCount = 0;  // Reset consecutive fail count for this AI model
        break;
      } catch (err) {
        aiModel.failCount++;
      }
    }

    if (!response) throw new Error('Could not fetch any AI response within the set retry threshold');

    // Extract only the AI's response
    // AI response JSON structure is the same for [OpenAI / Nvidia / DeepSeek / etc.] Chat Completions API responses
    // AI's response will always be returned as a String, so parse it into a JSON object
    const jsonParsedResponse = JSON.parse(response.data.choices[0].message.content)

    // Validate the AI's response against my expected JSON schema & Throw error if validation failed
    if (!validate(jsonParsedResponse)) {
      const error = new Error('JSON validation failed');
      error.status = 422;
      error.details = validate.errors;
      throw error;
    }

    res.json(jsonParsedResponse);
  } catch (err) {
    next(err); // forward unexpected error to middleware error handler
  }
});

// Middleware for global error handling (should be placed last) - triggered only when an error is passed to next(err)
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the error for server-side debugging

  // No need for specific error handling at this point
  res.status(500).json({ message: 'Something went wrong.' });
});

// Simple port listen
app.listen(PORT, () => console.log(`App listening on port ${PORT}!`))