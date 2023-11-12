
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Redis = require('ioredis');
const authMiddleware = require('./middleware/Authmiddleware');
const { User, UserBid, Game,Notification } = require('./models/usermodel');
require('dotenv').config()

const app = express();
const port = 3000;
const mongoose = require('mongoose');
app.use(cors({
    origin: '*'
}));
app.use(express.json());

const aws = require('aws-sdk');
const multer = require('multer');
const multerS3 = require('multer-s3');


const s3 = new aws.S3({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: 'eu-north-1',// Turn on debug logging
});


app.post('/generate-file-path', authMiddleware, async (req, res) => {
    const { fileType } = req.body; // The frontend should send the file type
    const fileExtension = fileType.split('/').pop();
    const filePath = `${req.user.userId}/${Date.now()}.${fileExtension}`; // Unique path for each file
  
    try {
      const uploadUrl = `${process.env.S3_BASE_URL}/${filePath}`;
      res.json({ filePath, uploadUrl });
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  });

// const upload =  () => multer({
//     storage: multerS3({
//          s3,
//         bucket: 'electro5050',
//         metadata: function (req, file, cb) {
//             cb(null, {fieldName: file.fieldname});
//         },
//         key: function (req, file, cb) {
//             cb(null, "image.jpeg");
//         }
//     })
// }).single('profilePicture'); 
// Use .single() with the name of your form field


// app.use(bodyParser.json());




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
        const { name, password } = req.body;

        if (!name && !password) {
            return res.status(400).json({ message: 'Please provide the data to update.' });
        }

        const userId = req.user.userId;
        const user = await User.findById(userId);

        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        if (name) user.name = name;
        if (password) user.password = password;

        await user.save();

        res.json({
            message: 'User details updated successfully.',
            user: {
                id: user.id,
                name: user.name,
                password: user.password
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

app.post('/update-avatar', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    const { avatarFileName } = req.body;

    try {
        // Using findOneAndUpdate to update the user
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId }, 
            { avatar: avatarFileName }, 
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        console.log("Avatar updated successfully for user:", updatedUser.name);
        res.status(200).json({ message: 'Avatar updated successfully', updatedUser });
    } catch (error) {
        console.error('Error updating user avatar:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

  
app.get('/users', authMiddleware, async (req, res) => {
    // Assuming authMiddleware attaches the user's ID to the request
    const userId = req.user && req.user.userId;
    if (!userId) {
        return res.status(400).json({ message: 'Invalid User Token' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send back user details
        res.json({
            id: user._id,
            name: user.name,
            email: user.email,
            // Add other relevant user details here
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});




// app.post('/upload-profile-picture', authMiddleware, (req, res) => {
//     console.log("File received:", req.file)
//     upload(req, res, async function (err) {
//         if (err instanceof multer.MulterError) {
//             // Handle errors related to multer
//             console.error('MulterError:', err);
//             return res.status(500).json({ message: 'Multer error', details: err.message });
//         } else if (err) {
//             // Handle unknown errors
//             console.error('Unknown Upload Error:', err);
//             return res.status(500).json({ message: 'Unknown upload error', details: err.message });
//         }
        
//         // If the authMiddleware did not attach user info to the request, return an error
//         const userId = req.user && req.user.userId;
//         if (!userId) {
//             console.error('Authentication Error: User info not found in request.');
//             return res.status(400).send({ message: 'Invalid User Token' });
//         }

//         // If no file was uploaded, return an error
//         if (!req.file) {
//             console.error('Upload Error: No file uploaded.');
//             return res.status(400).send({ message: 'No file uploaded.' });
//         }

//         try {
//             // Use the userId to find the user and update their profile picture URL
//             const user = await User.findById(userId);
//             if (!user) {
//                 console.error('User Not Found Error: User not found with provided ID.');
//                 return res.status(404).send({ message: 'User not found.' });
//             }
//             user.profilePictureUrl = req.file.location;
//             await user.save(); // Make sure to await the save operation
//             console.log('Profile picture uploaded successfully:', req.file.location);
//             res.json({ message: 'Profile picture uploaded successfully', profilePictureUrl: req.file.location });
//         } catch (error) {
//             console.error('Error uploading profile picture:', error);
//             res.status(500).json({ message: 'Internal Server Error', details: error.message, stack: error.stack });
//         }
//     });
// });



// Catch-all error handler
app.use((error, req, res, next) => {
    console.error('Unhandled Error:', error);
    res.status(500).json({ message: 'Unhandled error', details: error.message, stack: error.stack });
});









app.listen(port, '192.168.29.85', () => {
    console.log(`Server running at http://192.168.29.85:${port}/`);
});
