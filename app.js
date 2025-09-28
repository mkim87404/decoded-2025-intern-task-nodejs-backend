// Conditionally load environment variables (don't need dotenv package on Render production)
const isProd = process.env.NODE_ENV === 'production';
if (!isProd) { require('dotenv').config(); }
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const Ajv = require('ajv');
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware to only allow the frontend domain for CORS
app.use(cors({ origin: 'https://decoded-2025-intern-task-reactjs-frontend.onrender.com' }));
// app.use(cors()); // TEST PURPOSE - Allow all origins

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

// // API route example 1
// app.get('/hello', (req, res) => {
//   res.json({ message: 'Hello from backend!' });
// });

// API route - Extract & Return app requirements using an AI API
app.post('/extract', async (req, res, next) => {
  try {
    const userInput = req.body.description;
    const prompt = `Given a description of an app, first extract a list called "Roles" containing all agents that perform an action on this app, and for each "Role", devise a sublist called "Features" containing all functionalities of the app performed by the "Role". Each "Feature" will be implemented as a dedicated form on the app, so for each "Feature", devise 2 sublists called "Input Fields" and "Buttons" containing all relevant input fields and buttons that could go on the feature's form, respectively. Then, for each "Feature", include a property called "Entity" by deducing the most appropriate entity that is being acted upon on the feature's form, where this "Entity" will subsequently change state, and the app will typically keep track of this "Entity" through database tables. Finally, return a single JSON Object containing a property named "App Name", giving it an appropriate value considering the overall theme of the app, and a property named "Roles" which is the completed "Roles" list in its nested form. Your response must be a single valid JSON object matching the following JSON schema structure precisely { "App Name": string, "Roles": [ { "Role": string, "Features": [ { "Feature": string, "Entity": string, "Input Fields": [string], "Buttons": [string] } ] } ] } All key names must match exactly in spelling and capitalization and spacing. Do not include any explanation, markdown or formatting in your response. Do not wrap the entire response in quotes.
    App Description: """${userInput}"""`;
    // res.json(prompt);  // TESTING PURPOSE
    const response = await axios.post('https://openrouter.ai/api/v1/chat/completions', {
      model: process.env.AI_MODEL,
      messages: [{ role: 'user', content: prompt }],
    }, {
      headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' }
    });
    // Extract only the AI's Response
    // AI Response JSON Structure is the same for [OpenAI / Nvidia / DeepSeek] Chat Completions API Responses
    // AI's Response will always be returned as a String, so parse it into a JSON Object
    const jsonParsedResponse = JSON.parse(response.data.choices[0].message.content)

    // Validate the AI's Response against my Expected JSON Schema & Throw Error if validation failed
    if (!validate(jsonParsedResponse)) {
      const error = new Error('JSON validation failed');
      error.status = 422;
      error.details = validate.errors;
      throw error; // this will be caught below
    }

    res.json(jsonParsedResponse);
  } catch (err) {
    next(err); // forward unexpected error to middleware error handler
  }
});

// Middleware for global error handling (should be placed last) - triggered only when an error is passed to next(err)
app.use((err, req, res, next) => {
  console.error(err.stack); // Log the error for debugging

  // Don't really need specific error handling at this point
  // if (err instanceof SyntaxError && err.status === 400 && 'body' in err) {
  //   // Handle JSON parsing errors specifically
  //   return res.status(400).json({ message: 'Invalid JSON format in request body.' });
  // }

  // Handle other types of errors
  res.status(500).json({ message: 'Something went wrong.' });
});

// Simpler port listen
app.listen(PORT, () => console.log(`App listening on port ${PORT}!`))

// Alternative port listen - Update keepAlive settings for server to avoid TCP race condition.
// const server = app.listen(PORT, () => console.log(`App listening on port ${PORT}!`));
// server.keepAliveTimeout = 120 * 1000;
// server.headersTimeout = 120 * 1000;