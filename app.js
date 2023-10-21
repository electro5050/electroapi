const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Redis = require('ioredis');
const authMiddleware = require('./middleware/Authmiddleware');
const User = require('./models/usermodel');  // Change the path accordingly


const app = express();
const port = 3000;
const mongoose = require('mongoose');
mongoose.connect('mongodb+srv://hrelectroweb:electro@cluster0.yru2wau.mongodb.net/?retryWrites=true&w=majority&appName=AtlasApp', { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', () => {
  console.log('Connected to MongoDB!');
});

mongoose.connection.on('error', (err) => {
  console.error('Failed to connect to MongoDB:', err);
});


const redisClient = new Redis('redis://localhost:6379/0');

redisClient.on('error', err => {
    console.error('There was an error with the Redis client:', err);
});

app.use(cors({
  origin: '*'
}));


app.use(bodyParser.json());

async function publishToRedis(channel, message) {
    try {
        await redisClient.publish(channel, message);
        return true;
    } catch (err) {
        console.error('Error publishing to Redis:', err);
        return false;
    }
}

app.post('/switch', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    if (!userId) return res.status(400).send('Invalid User Token');
    
    const message = JSON.stringify({ action: 'switch', userId });

    if (await publishToRedis('test', message)) {
        res.status(200).json({ message: 'Switched room successfully' });
    } else {
        res.status(500).json({ message: 'Error switching room' });
    }
});

app.post('/bid', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    if (!userId) return res.status(400).send('Invalid User Token');

    const { coinCount, buttonType } = req.body;

    // Assuming userId refers to email for now, modify as needed
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    if (user.coinbalance < coinCount) return res.status(400).json({ message: 'Not enough coins to bid' });

    const message = JSON.stringify({ coinCount, buttonType, userId });

    if (await publishToRedis('test', message)) {
        user.coinbalance -= coinCount; // Deduct the coin balance immediately after the bid is validated.
        await user.save();
        res.status(200).json({ message: 'Data received successfully', coinbalance: user.coinbalance });
    } else {
        res.status(500).json({ message: 'Error publishing to Redis' });
    }
});

app.get('/coinbalance', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    try {
        const user = await User.findById(userId);
        if (!user) return res.status(404).json({ message: 'User not found' });
        
        res.status(200).json({ coinbalance: user.coinbalance });
    } catch (error) {
        console.error('Error fetching coin balance for user:', error);
        res.status(500).json({ message: 'Internal Server Error' });
    }
});




app.listen(port, '192.168.29.85', () => {
    console.log(`Server running at http://192.168.29.85:${port}/`);
});

