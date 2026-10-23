import { createApp } from './app.js';
import { config } from './config.js';

const app = createApp();

app.listen(config.port, () => {
  console.log(`[ResQ AI Backend] Service running on port ${config.port}`);
  console.log(`[ResQ AI Backend] Storage: ${config.storageType}`);
  console.log(`[ResQ AI Backend] Gemini API: ${config.geminiApiKey ? 'CONFIGURED (' + config.geminiModel + ')' : 'NOT CONFIGURED (Demo Mode available)'}`);
});
