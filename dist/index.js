"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const app_1 = require("./app");
const db_1 = require("./db");
const eventIndexer_1 = require("./eventIndexer");
const PORT = process.env.PORT ?? 3000;
(0, db_1.migrate)()
    .then(() => {
    const app = (0, app_1.createApp)();
    const server = app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
    (0, eventIndexer_1.startEventIndexer)().catch((err) => {
        console.error('Failed to start event indexer', err);
    });
    process.on('SIGTERM', () => {
        console.log('SIGTERM received, shutting down gracefully');
        server.close();
    });
})
    .catch((err) => {
    console.error('Failed to migrate DB', err);
    process.exit(1);
});
