const express = require('express');
const https = require('https');
const path = require('path');
const app = express();

// FYI: `npx kill-port 8000`
const PORT = process.env.PORT || 8000;
const IS_DEV = process.env.NODE_ENV === 'development';
const clientPath = path.join(__dirname, '..', 'client');

app.use(express.static(clientPath));

// Emulate GitHub Pages behavior: Any URL that points to a non-existing HTML file gets redirected to 404.html
// Whever this happens, we manually redirect from that 404.html to our "/" route and take over using client-side routing
app.get('/', (req, res) => res.sendFile(path.resolve(clientPath, 'index.html')));
app.get('/*', (req, res) => res.sendFile(path.resolve(clientPath, '404.html')));

app.listen(PORT, () => {
    console.log(`⚡️[server]: Server is running at port ${PORT} in NODE_ENV: ${process.env.NODE_ENV}`);
    if (IS_DEV) {
        console.log(`⚡️[server]: Visit http://localhost:${PORT}`);
    }
});

https.createServer({}, app);