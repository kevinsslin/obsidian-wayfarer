import { readFileSync, writeFileSync } from "fs";

// `pnpm bump 0.1.1`: writes the version into package.json and manifest.json and
// records it in versions.json (version -> minAppVersion). Commit, then tag with
// the bare version (`git tag 0.1.1`) to trigger the release workflow.
const targetVersion = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(targetVersion ?? "")) {
  console.error("usage: pnpm bump <major.minor.patch>");
  process.exit(1);
}

const write = (file, obj, indent) => writeFileSync(file, JSON.stringify(obj, null, indent) + "\n");

const pkg = JSON.parse(readFileSync("package.json", "utf8"));
pkg.version = targetVersion;
write("package.json", pkg, 2);

const manifest = JSON.parse(readFileSync("manifest.json", "utf8"));
manifest.version = targetVersion;
write("manifest.json", manifest, "\t");

const plugin = JSON.parse(readFileSync(".claude-plugin/plugin.json", "utf8"));
plugin.version = targetVersion;
write(".claude-plugin/plugin.json", plugin, "  ");

const versions = JSON.parse(readFileSync("versions.json", "utf8"));
versions[targetVersion] = manifest.minAppVersion;
write("versions.json", versions, "\t");
console.log(`${targetVersion} (minAppVersion ${manifest.minAppVersion})`);
