export const mapModeLocationVersionUpgrades = [
  {
    toVersion: 1,
    statements: [
      `CREATE TABLE IF NOT EXISTS map (
          mapId integer PRIMARY KEY AUTOINCREMENT NOT NULL,
          name VARCHAR(64) NOT NULL,
          progress real NOT NULL check (progress between 0 and 1)
        );`,
      `CREATE TABLE IF NOT EXISTS mode (
          modeId integer NOT NULL,
          mapId integer NOT NULL,
          name VARCHAR(64) NOT NULL,
          progress real NOT NULL, check (progress between 0 and 1),
          PRIMARY KEY (mapId, modeId),
          FOREIGN KEY (mapId) REFERENCES map (mapId)
        );`,
      `CREATE TABLE IF NOT EXISTS location (
          locationId integer NOT NULL,
          mapId integer NOT NULL,
          modeId integer NOT NULL,
          name VARCHAR(64) NOT NULL,
          progress integer NOT NULL check (progress between 0 and 7),
          PRIMARY KEY (mapId, modeId, locationId),
          FOREIGN KEY (mapId, modeId) REFERENCES mode (mapId, modeId)
        );`,
    ]
  },
]
