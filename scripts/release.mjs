import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd, opts = {}) {
  console.log(`\n\x1b[36m> ${cmd}\x1b[0m`);
  return execSync(cmd, { cwd: ROOT, stdio: "inherit", ...opts });
}

function runOutput(cmd) {
  return execSync(cmd, { cwd: ROOT, encoding: "utf8" }).trim();
}

function bumpVersion(current, type = "patch") {
  const parts = current.split(".").map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid current version: ${current}`);
  }
  let [major, minor, patch] = parts;
  if (type === "major") {
    major += 1;
    minor = 0;
    patch = 0;
  } else if (type === "minor") {
    minor += 1;
    patch = 0;
  } else if (type === "patch") {
    patch += 1;
  } else if (/^\d+\.\d+\.\d+$/.test(type)) {
    return type;
  } else {
    throw new Error(`Unknown bump type: ${type}. Use 'patch', 'minor', 'major', or 'X.Y.Z'.`);
  }
  return `${major}.${minor}.${patch}`;
}

async function main() {
  const arg = process.argv[2] || "patch";

  // Check publisher auth
  console.log("Checking publisher identity...");
  try {
    const whoami = runOutput("pnpm exec emdash-plugin whoami");
    console.log(whoami);
  } catch (err) {
    console.error("\x1b[31mError: emdash-plugin is not authenticated. Run 'pnpm exec emdash-plugin login' first.\x1b[0m");
    process.exit(1);
  }

  // Read current version
  const pkgPath = path.join(ROOT, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  const prevVersion = pkg.version;
  const nextVersion = bumpVersion(prevVersion, arg);

  console.log(`\n\x1b[32mBumping version: ${prevVersion} -> ${nextVersion}\x1b[0m\n`);

  // Update package.json
  pkg.version = nextVersion;
  fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

  // Update src/index.ts
  const indexPath = path.join(ROOT, "src/index.ts");
  if (fs.existsSync(indexPath)) {
    let indexContent = fs.readFileSync(indexPath, "utf8");
    indexContent = indexContent.replace(
      new RegExp(`version:\\s*["']${prevVersion}["']`),
      `version: "${nextVersion}"`
    );
    fs.writeFileSync(indexPath, indexContent);
  }

  // Build & Bundle
  run("pnpm run build");
  run("pnpm run bundle:validate");

  // Publish to EmDash ATProto Registry
  run("mkdir -p .tmp && TMPDIR=\"$(pwd)/.tmp\" pnpm exec emdash-plugin publish");

  // Sync package profile (descriptions, screenshots, etc.)
  try {
    run("mkdir -p .tmp && TMPDIR=\"$(pwd)/.tmp\" pnpm exec emdash-plugin update-package --yes");
  } catch {
    // Already up to date or no diff
  }

  // Git commit and tag
  const tagName = `freeform/v${nextVersion}`;
  run("git add package.json src/index.ts docs/ emdash-plugin.jsonc");
  run(`git commit -m "chore(release): freeform v${nextVersion}"`);
  run(`git tag -a ${tagName} -m "freeform v${nextVersion}"`);

  // Git push
  console.log(`\nPushing commit and tag ${tagName} to GitHub...`);
  run("git push origin main");
  run(`git push origin ${tagName}`);

  console.log(`\n\x1b[32m✔ Successfully published and pushed freeform v${nextVersion}!\x1b[0m`);
  console.log(`Listing: https://plugins.emdashcms.com/plugins/@solspace.com/freeform\n`);
}

main().catch((err) => {
  console.error("\n\x1b[31mRelease failed:\x1b[0m", err);
  process.exit(1);
});
