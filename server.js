require('dotenv').config({ path: '../.env' }); // Assuming .env is at the root directory
// Or also check local backend directory
require('dotenv').config();

const app = require('./app');

const PORT = process.env.PORT || 5000;

app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
});
