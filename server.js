require('dotenv').config({ path: '../.env' });
require('dotenv').config();

const app = require('./app');
const { startScheduler } = require('./src/services/scheduler');

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
    // Start the scheduled publishing service
    startScheduler();
});
