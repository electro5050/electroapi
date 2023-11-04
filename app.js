
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Redis = require('ioredis');
const authMiddleware = require('./middleware/Authmiddleware');
const { User, UserBid, Game,Notification } = require('./models/usermodel');

const app = express();
const port = 3000;
const mongoose = require('mongoose');

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb+srv://hrelectroweb:electro@cluster0.yru2wau.mongodb.net/?retryWrites=true&w=majority&appName=AtlasApp'; // Moved to environment variable
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

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
    const { gameId } = req.body;  // Extract gameId from the request body
    if (!userId) return res.status(400).send('Invalid User Token');

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { coinCount, buttonType } = req.body;
    if (user.coinbalance < coinCount) return res.status(400).json({ message: 'Not enough coins to bid' });

    const currentGame = await Game.findById(gameId);
    if (!currentGame) return res.status(404).json({ message: 'Game not found' });

    const newBid = new UserBid({
        user: userId,
        bid_amount: coinCount,
        coin_type: buttonType,
        game: currentGame._id
    });

    await newBid.save();
    
    user.coinbalance -= coinCount;
    await user.save();

    const message = JSON.stringify({ coinCount, buttonType, userId });

    if (await publishToRedis('test', message)) {
        res.status(200).json({ message: 'Bid received successfully', coinbalance: user.coinbalance });
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

//notifications 

app.post('/notification', async (req, res) => {
    const { title, message, imageUrl } = req.body;

    // Validation
    if (!title || !message) {
        return res.status(400).json({ message: 'Both title and message are required fields!' });
    }

    const newNotification = new Notification({
        title,
        message,
        imageUrl  // this is optional, so it's okay if it's not provided
    });

    try {
        await newNotification.save();
        res.status(201).json({ message: 'Notification saved successfully!' });
    } catch (error) {
        console.error('Error saving the notification:', error);
        res.status(500).json({ message: 'Internal Server Error. Unable to save the notification.' });
    }
});

app.get('/notification', async (req, res) => {
    try {
        const notifications = await Notification.find(); // This will fetch all the notifications from the database
        res.status(200).json(notifications);
    } catch (error) {
        console.error('Error fetching the notifications:', error);
        res.status(500).json({ message: 'Internal Server Error. Unable to fetch the notifications.' });
    }
});


//Updating user profile

app.put('/login',authMiddleware, async (req, res) => {
    try {
        const { name, email } = req.body;

        if (!name && !email) {
            return res.status(400).json({ message: 'Please provide the data to update.' });
        }

        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (name) user.name = name;
        if (email) user.email = email;

        await user.save();

        res.json({
            message: 'User details updated successfully.',
            user: {
                id: user.id,
                name: user.name,
                email: user.email
            }
        });
    } catch (err) {
        console.error("Error during user update:", err);
        res.status(500).json({ message: "Server error." });
    }
});

app.get('/usergamehistory', authMiddleware, async (req, res) => {

    // 1. Logging the user ID
    const userId = req.user && req.user.userId;
    console.log("User ID:", userId); 
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    const user = await User.findById(userId).exec();
    if (!user) return res.status(404).json({ message: 'User not found' });
    console.log("User's Name:", user.name);

    try {
        // 2. Fetch and log the user bids
        const bids = await UserBid.find({ user: userId })
            .populate('game')
            .exec();
        console.log("Fetched bids:", bids);

        const result = bids.filter(bid => bid.game).map(bid => {
            let win = 0;
            let loss = 0;
        
            // 3. Logging bid details for debugging
            console.log("Processing bid:", bid);
            console.log("Bid's coin type:", bid.coin_type);
            console.log('bid game:', bid.game)
            console.log('winners' , bid.game.winners)
            console.log('winning color',bid.game.winning_color)
        
                if (bid.game.winners.winningBonus) {
                    win = bid.game.winners.winningBonus; // Or some other logic to decide the win amount based on winningBonus
                } else {
                    loss = bid.bid_amount;
                }
           
        
            return {
                username: user.name,
                bidAmount: bid.bid_amount,
                win,
                loss,
                startTime: bid.game.start_time
            };
        });
        

        // 4. Log the final result
        console.log("Result:", result);
        res.status(200).json(result);

    } catch (error) {
        // 5. Enhanced error logging
        console.error('Error fetching user game history:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});


app.get('/allusersgamehistory', authMiddleware, async (req, res) => {
    
    // 1. Authenticate and get user details
    const userId = req.user && req.user.userId;
    console.log("Authenticated User ID:", userId); 
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    const authUser = await User.findById(userId).exec();
    if (!authUser) return res.status(404).json({ message: 'Authenticated user not found' });
    console.log("Authenticated User's Name:", authUser.name);
    
    try {
        // 2. Fetch all bids and log them
        const allBids = await UserBid.find()
            .populate('game')
            .populate('user')
            .exec();

        const results = allBids.filter(bid => bid.game).map(bid => {
            let win = 0;
            if (bid.coin_type === bid.game.winning_color) {
                console.log("winningBonus type:", typeof bid.game.winners.winningBonus);  // Check data type
                win = Number(bid.game.winners.winningBonus);  // Convert to number
            } 

            return {
                userId: bid.user._id,
                username: bid.user.name,
                win
            };
        });

        console.log("Intermediate results:", results);  // Log intermediate results

        const totalWinningAmounts = results.reduce((acc, curr) => {
            if (!acc[curr.userId]) {
                acc[curr.userId] = {
                    username: curr.username,
                    totalWin: 0  // Make sure this is a number
                };
            }
            acc[curr.userId].totalWin += Number(curr.win);  // Convert to number during addition
            return acc;
        }, {});

        console.log("Total winnings by user:", totalWinningAmounts);  // Log total winnings by user

        const sortedUsersByWinnings = Object.values(totalWinningAmounts).sort((a, b) => b.totalWin - a.totalWin);

        // 3. Log the final result
        console.log("Sorted Users by Winnings:", sortedUsersByWinnings);
        res.status(200).json(sortedUsersByWinnings);

    } catch (error) {
        // 4. Enhanced error logging
        console.error('Error fetching all users game history:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});








app.listen(port, '192.168.29.85', () => {
    console.log(`Server running at http://192.168.29.85:${port}/`);
});
