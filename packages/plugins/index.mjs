import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import handler from 'serve-handler';
import { fileURLToPath } from 'url';
import { WebSocketServer } from 'ws';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pluginDirName = 'dev';
const pluginPath = path.join(__dirname, pluginDirName);

const server = http.createServer((request, response) => {
  response.setHeader('Access-Control-Allow-Origin', '*');
  response.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  response.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  response.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Expires', '0');

  if (request.url === '/list') {
    fs.readdir(pluginPath, { withFileTypes: true }, (err, files) => {
      if (err) {
        console.error(err);
        response.writeHead(500);
        response.end('Server error');
        return;
      }

      const fileList = files
        .filter(dirent => dirent.isFile())
        .map(dirent => `dev/${dirent.name}`);

      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(JSON.stringify(fileList));
    });
  } else {
    // Fallback to serve-handler for other routes
    return handler(request, response);
  }
});

const wss = new WebSocketServer({ server, verifyClient: (info, cb) => cb(true)});

wss.on('connection', function connection(ws) {
  console.log('A client connected');
});

// Watch the plugin directory for changes.
// `recursive: true` is unavailable on Linux for Node < 20.13, so try it first
// and fall back to a non-recursive watch (the `dev/` directory is flat anyway).
function startWatcher(options) {
  return fs.watch(pluginPath, options, (eventType, filename) => {
    if (filename) {
      console.log(`File changed: ${filename}`);
      console.log(`emitting: ${path.join(pluginDirName, filename)}`);
      wss.clients.forEach(function each(client) {
        if (client.readyState === 1) {
          client.send(JSON.stringify({
            eventType,
            path: path.join(pluginDirName, filename)
          }));
        }
      });
    }
  });
}

try {
  startWatcher({ recursive: true });
} catch (err) {
  if (err && err.code === 'ERR_FEATURE_UNAVAILABLE_ON_PLATFORM') {
    console.warn('Recursive fs.watch unavailable on this platform; falling back to non-recursive watch.');
    startWatcher({});
  } else {
    throw err;
  }
}

server.listen(1993, () => {
  console.log('Plugin Dev Server running at http://localhost:1993');
});