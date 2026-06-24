import { createApp } from './app';
import { migrate } from './db';

const PORT = process.env.PORT ?? 3000;

migrate()
  .then(() => {
    createApp().listen(PORT, () => {
      console.log(`Server running on port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error('Failed to migrate DB', err);
    process.exit(1);
  });
