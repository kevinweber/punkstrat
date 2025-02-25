# PunkStrat

## Adding new pages

* The site is served using static GitHub Pages. During development, a node server tries to emulate static rendering behavior.
* When adding a new page, make sure to create a matching HTML file that is an exact copy of `client/index.html`.
* Then add a route to `client/index.js` pointing to the respective view file that includes the content for the page.
* If DevTools during development show "404 (Not Found)" for a page but the content is still shown, it likely means that there's no matching HTML file for the current URL and GitHub Pages will show a 404 once the code is deployed.

## Personal AI Agent

The site includes a simple personal AI agent demo page:

* The agent uses an in-memory storage solution to maintain conversation history
* The implementation uses pattern matching to provide relevant responses to common queries
* The application maintains a consistent design language with the main site
* To integrate with a real AI service, update the `processMessage` function in `client/views/PersonalAgent.js`

The personal agent can be accessed at `/personal-agent` and supports:
* Text conversations
* PDF document uploads (for potential knowledge base integration)
* Message history stored during the server session

### Connecting to an External AI API

The current implementation uses pattern matching for responses, but you can easily integrate with an external AI API:

1. **OpenAI Integration**:
   ```javascript
   // In client/views/PersonalAgent.js
   const processMessage = async (userMessage) => {
     try {
       const response = await fetch('/api/ai', {
         method: 'POST',
         headers: {
           'Content-Type': 'application/json'
         },
         body: JSON.stringify({
           message: userMessage,
           userId: USER_ID
         })
       });
       
       if (!response.ok) throw new Error('AI service error');
       const data = await response.json();
       return data.response;
     } catch (error) {
       console.error('Error calling AI service:', error);
       return "I'm having trouble connecting to my AI service. Please try again later.";
     }
   };
   ```

2. **Server-side Implementation**:
   ```javascript
   // In a new file: server/ai-integration.js
   const express = require('express');
   const router = express.Router();
   const { Configuration, OpenAIApi } = require("openai");
   
   const configuration = new Configuration({
     apiKey: process.env.OPENAI_API_KEY,
   });
   const openai = new OpenAIApi(configuration);
   
   router.post('/ai', async (req, res) => {
     try {
       const { message, userId } = req.body;
       
       const completion = await openai.createChatCompletion({
         model: "gpt-3.5-turbo",
         messages: [
           { role: "system", content: "You are a helpful personal assistant for the PunkStrat website." },
           { role: "user", content: message }
         ]
       });
       
       res.json({ response: completion.data.choices[0].message.content });
     } catch (error) {
       console.error('OpenAI API error:', error);
       res.status(500).json({ error: 'Failed to get AI response' });
     }
   });
   
   module.exports = router;
   ```

3. **Add the route to app.js**:
   ```javascript
   // In server/app.js
   const aiIntegration = require('./ai-integration');
   // ...
   app.use('/api/ai', aiIntegration);
   ```

4. **Install the OpenAI SDK**:
   ```
   npm install openai
   ```

5. **Add your API key to .env**:
   ```
   OPENAI_API_KEY=your_api_key_here
   ```

## Dev notes

* Run `npm install` to get the latest NPM dependencies.
* Run `npm run build:libs:preact` and `npm run build:libs:htm` to update the Preact and HTM dependencies.
* Run `npm run dev` to run a Node server in development, then view the site on <http://localhost:8000/>.

To upgrade dependencies to latest minor version quickly:

* Run `npm upgrade --save`

Tech stack:

* No build for the app code. Less headaches.
* Third-party dependencies are imported from absolute URLs via skypack or unpkg, or they were bundled manually using esbuild.
* Preact instead of React: <https://preactjs.com/>
* HTM instead of JSX: <https://github.com/developit/htm>
* Routing: <https://github.com/preactjs/preact-router>

## Known challenges

* Manually creating HTML files is tedious. HTML code redundancies could be reduced using Jekyll. But adding support for this adds complexity to this project. Another approach could be to automatically redirect from the 404.html to the index.html, then rely on client-rendering for every page. This, however, results in at least a brief flicker of the URL when the redirect is happening and crawlers like Brave's WayBack Machine integration could falsely assume that a non-existing page is shown.
