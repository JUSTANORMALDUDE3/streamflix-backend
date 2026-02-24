const mongoose = require('mongoose');
const User = require('../models/User');
const dns = require('dns');

// Override local network DNS specifically for the Node process to ensure MongoDB SRV resolution
// This bypasses local ISP blocks on mongodb+srv queries.
dns.setServers(['8.8.8.8', '8.8.4.4']);

const connectDB = async () => {
    try {
        const conn = await mongoose.connect(process.env.MONGO_URI);
        console.log(`MongoDB Connected: ${conn.connection.host}`);

        // Inject default admin user if not exists
        await setupDefaultAdmin();
    } catch (error) {
        console.error(`Error connecting to MongoDB: ${error.message}`);
        process.exit(1);
    }
};

const setupDefaultAdmin = async () => {
    try {
        const adminExists = await User.findOne({ username: 'admin' });
        if (!adminExists) {
            const bcrypt = require('bcryptjs');
            const salt = await bcrypt.genSalt(10);
            const hashedPassword = await bcrypt.hash('@admin', salt);

            // Create default admin user directly
            await User.create({
                username: 'admin',
                password: hashedPassword,
                rank: 'top',
                role: 'admin'
            });
            console.log('Default Admin created: admin / @admin');
        }
    } catch (error) {
        console.error(`Error setting up default admin: ${error.message}`);
    }
};

module.exports = connectDB;
