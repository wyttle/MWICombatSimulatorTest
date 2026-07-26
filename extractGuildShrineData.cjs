const fs = require("fs");
const path = require("path");

const projectRoot = __dirname;
const sourcePath = path.join(projectRoot, "initClientData.json");
const outputDirectory = path.join(projectRoot, "src", "combatsimulator", "data");
const clientData = JSON.parse(fs.readFileSync(sourcePath, "utf8"));

for (const mapName of ["guildShrineDetailMap", "guildBuffDetailMap"]) {
    if (!clientData[mapName]) {
        throw new Error(`Missing ${mapName} in initClientData.json`);
    }

    const outputPath = path.join(outputDirectory, `${mapName}.json`);
    fs.writeFileSync(outputPath, `${JSON.stringify(clientData[mapName], null, 2)}\n`);
}
