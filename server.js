// ======================
// Distance Map Server
// ======================

import express from "express";
import path from "path";
import { fileURLToPath } from "url";

const app = express();
const PORT = process.env.PORT || 3000;

// Needed for proper file paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Serve your HTML file
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "Distance Excel.html"));
});

// Serve static files (like JS, CSS, images)
app.use(express.static(__dirname));

// Start the server
app.listen(PORT, () => {
  console.log(`🌎 Server running on port ${PORT}`);
});
