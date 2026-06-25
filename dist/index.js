"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const app_1 = require("./app");
const db_1 = require("./db");
const PORT = process.env.PORT ?? 3000;
(0, db_1.migrate)()
    .then(() => {
    (0, app_1.createApp)().listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
})
    .catch((err) => {
    console.error('Failed to migrate DB', err);
    process.exit(1);
});
