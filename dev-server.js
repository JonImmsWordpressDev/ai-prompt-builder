import { createServer } from 'node:http';
import { apbBuildHtml } from './build.js';

const APB_PORT = Number(process.env.APB_PORT || 4518);

createServer((req, res) => {
  if (req.url !== '/' && req.url !== '/index.html') {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('Not found');
    return;
  }
  try {
    const html = apbBuildHtml();
    res.writeHead(200, {
      'content-type': 'text/html; charset=utf-8',
      'cache-control': 'no-store',
    });
    res.end(html);
  } catch (err) {
    res.writeHead(500, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(`Build failed:\n\n${err.stack}`);
  }
}).listen(APB_PORT, '127.0.0.1', () => {
  console.log(`AI Prompt Builder dev server: http://127.0.0.1:${APB_PORT}`);
});
