import express from "express";
import path from "path";
import fs from "fs";
import { createServer as createViteServer } from "vite";
import AdmZip from "adm-zip";

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Serve API to download the project files as a ZIP
  app.get("/api/download-zip", (req, res) => {
    try {
      const zip = new AdmZip();
      const workspaceRoot = process.cwd();

      function addDirectoryToZip(currentDir: string, zipPathPrefix: string) {
        const files = fs.readdirSync(currentDir);
        for (const file of files) {
          // Exclude dependency, build, and system folders/files
          if (
            file === "node_modules" ||
            file === "dist" ||
            file === ".git" ||
            file === ".next" ||
            file === ".cache"
          ) {
            continue;
          }

          const fullPath = path.join(currentDir, file);
          const stat = fs.statSync(fullPath);

          if (stat.isDirectory()) {
            addDirectoryToZip(fullPath, zipPathPrefix ? path.join(zipPathPrefix, file) : file);
          } else {
            zip.addLocalFile(fullPath, zipPathPrefix);
          }
        }
      }

      addDirectoryToZip(workspaceRoot, "");

      const zipBuffer = zip.toBuffer();
      
      res.setHeader("Content-Type", "application/zip");
      res.setHeader("Content-Disposition", "attachment; filename=pawpal-boarding-project.zip");
      res.send(zipBuffer);
    } catch (err: any) {
      console.error("Error creating ZIP:", err);
      res.status(500).send("Error creating zip archive: " + err.message);
    }
  });

  // API health check
  app.get("/api/health", (req, res) => {
    res.json({ status: "ok" });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
