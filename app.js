
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const Redis = require('ioredis');
const authMiddleware = require('./middleware/Authmiddleware');
const { User, UserBid, Game,Notification,ChatMessage } = require('./models/usermodel');
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
    region: 'eu-north-1'
});

// Endpoint to generate pre-signed URL
app.get('/generate-presigned-url', authMiddleware, async (req, res) => {
    try {
        const userId = req.user && req.user.userId;
        if (!userId) {
            return res.status(400).send({ message: 'Invalid User Token' });
        }

        const key = `${Date.now().toString()}-${userId}`;
        const params = {
            Bucket: 'electro5050',
            Key: key,
            Expires: 60 // Expires in 60 seconds
        };

        s3.getSignedUrl('putObject', params, (err, url) => {
            if (err) {
                console.error('Error generating pre-signed URL:', err);
                return res.status(500).send({ message: 'Error generating pre-signed URL.' });
            }
            res.json({ preSignedUrl: url, key });
        });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});

// Endpoint to update user profile picture URL after upload
app.post('/update-profile-picture', authMiddleware, async (req, res) => {
    try {
        const { userId, key } = req.body;
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).send({ message: 'User not found.' });
        }

        const fileUrl = `https://${process.env.BUCKET_NAME}.s3.amazonaws.com/${key}`;
        user.profilePictureUrl = fileUrl;
        await user.save();

        res.json({ message: 'Profile picture updated successfully', profilePictureUrl: fileUrl });
    } catch (error) {
        console.error('Error:', error);
        res.status(500).send({ message: 'Internal Server Error' });
    }
});





const MONGODB_URI = process.env.MONGODB_URI || 'electra5050@docdb-2024-01-25-17-18-55.cp0ip1rsquov.ap-south-1.docdb.amazonaws.com:27017/?tls=true&tlsCAFile=global-bundle.pem&replicaSet=rs0&readPreference=secondaryPreferred&retryWrites=false' // Moved to environment variable
mongoose.connect(MONGODB_URI, { useNewUrlParser: true, useUnifiedTopology: true });

mongoose.connection.on('connected', () => {
    console.log('Connected to MongoDB!');
});

mongoose.connection.on('error', (err) => {
    console.error('Failed to connect to MongoDB:', err);
});

const redisClient = new Redis('redis://electra-0001-001.dw3abo.0001.aps1.cache.amazonaws.com:6379/0');
// const redisClient = new Redis('redis://localhost:6379/0');


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

    const { gameId } = req.body;
    
    const userIdObj = new  mongoose.Types.ObjectId(userId);
    const gameIdObj = new  mongoose.Types.ObjectId(gameId);

    UserBid.findOne({ user: userIdObj, game: gameIdObj})
        .then((userBid) => {
            if (userBid) {

            const currentButtonType = userBid.coin_type;
            const updatedButtonType = currentButtonType === "gold" ? "silver" : "gold"; 

            return UserBid.updateOne(
                { user: userIdObj, game: gameIdObj },
                { $set: { coin_type: updatedButtonType } }
            );
            }
        })
        .then((result) => {
        })
        .catch((err) => {
            console.error('Error updating document:', err);
    });


    if (await publishToRedis('game_queue', message)) {
        res.status(200).json({ message: 'Switched room successfully' });
    } else {
        res.status(500).json({ message: 'Error switching room' });
    }
});

app.post('/bid', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    // const { gameId } = req.body;  // Extract gameId from the request body
    if (!userId) return res.status(400).send('Invalid User Token');

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });

    const { gameId, coinCount, buttonType } = req.body;

    if (user.coinbalance < coinCount) return res.status(400).json({ message: 'Not enough coins to bid' });

    const currentGame = await Game.findById(gameId);
    if (!currentGame) return res.status(404).json({ message: 'Game not found' });

    UserBid.findOne({ user: userId, game: currentGame._id })
    .then(existingBid => {
        if (existingBid) {
            // Bid already exists, update bid_amount
            existingBid.bid_amount += coinCount;
             return existingBid.save();
        } else {
            // Bid does not exist, create a new one
            const newBid = new UserBid({
                user: userId,
                bid_amount: coinCount,
                coin_type: buttonType,
                game: currentGame._id
            });

            return newBid.save();
        }
    })
    .then(() => {
    })
    .catch(error => {
        // Handle any errors
        console.error(error);
    });
    
    user.coinbalance -= coinCount;
    await user.save();
    const message = JSON.stringify({ coinCount, buttonType, userId, username: user.userId });

    if (await publishToRedis('game_queue', message)) {
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
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    const user = await User.findById(userId).exec();
    if (!user) return res.status(404).json({ message: 'User not found' });

    try {
        // 2. Fetch and log the user bids
        const bids = await UserBid.find({ user: userId })
            .populate('game')
            .exec();

        const result = bids.filter(bid => bid.game).map(bid => {
            let win = 0;
            let loss = 0;
        
                if (bid.coin_type === bid.game.winning_color) {
                    win = 2 * bid.bid_amount// Or some other logic to decide the win amount based on winningBonus
                } else {
                    loss = bid.bid_amount;
                }
           
        
            return {
                username: user.name,
                bidAmount: bid.bid_amount,
                win,
                loss,
                startTime: bid.game.start_time,
                Room: bid.coin_type
            };
        });
        
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
    if (!userId) return res.status(400).json({ message: 'Invalid User Token' });

    const authUser = await User.findById(userId).exec();
    if (!authUser) return res.status(404).json({ message: 'Authenticated user not found' });
    
    try {
        // 2. Fetch all bids and log them
        const allBids = await UserBid.find()
            .populate('game')
            .populate('user')
            .exec();


            const results = allBids.filter(bid => bid.game && bid.user).map(bid => {
                let win = 0;
                if (bid.coin_type === bid.game.winning_color) {
                    win = 2*bid.bid_amount;
                } 
    
                return {
                    userId: bid.user._id,
                    username: bid.user.name,
                    profilePictureUrl: bid.user.profilePictureUrl,
                    win
                };
            });

        const totalWinningAmounts = results.reduce((acc, curr) => {
            if (!acc[curr.userId]) {
                acc[curr.userId] = {
                    username: curr.username,
                    profilePictureUrl: curr.profilePictureUrl,
                    totalWin: 0  // Make sure this is a number
                };
            }
            acc[curr.userId].totalWin += Number(curr.win);  // Convert to number during addition
            return acc;
        }, {});

        const sortedUsersByWinnings = Object.values(totalWinningAmounts).sort((a, b) => b.totalWin - a.totalWin);

        res.status(200).json(sortedUsersByWinnings.slice(0, 10));

    } catch (error) {
        // 4. Enhanced error logging
        console.error('Error fetching all users game history:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});

app.post('/update-avatar', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;

    if (!userId) {
        return res.status(400).json({ message: 'Invalid User Token' });
    }
    const { avatarFileName } = req.body;
    try {
        const updatedUser = await User.findOneAndUpdate(
            { _id: userId }, 
            { profilePictureUrl: avatarFileName }, 
            { new: true, runValidators: true }
        );

        if (!updatedUser) {
            return res.status(404).json({ message: 'User not found' });
        }

        res.status(200).json({ message: 'Avatar updated successfully', updatedUser });
    } catch (error) {
        console.error('Error updating user avatar:', error); // Log any errors
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});



  
app.get('/users', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    if (!userId) {
        return res.status(400).json({ message: 'Invalid User Token' });
    }

    try {
        const user = await User.findById(userId);
        if (!user) {
            return res.status(404).json({ message: 'User not found' });
        }

        // Send back user details including the avatar filename
        res.json({
            id: user._id,
            ...user.toObject()
            // name: user.name,
            // email: user.email,
            // profilePictureUrl: user.profilePictureUrl, 
            // userId: user.userId
        });
    } catch (error) {
        console.error('Error fetching user profile:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});


// Endpoint to update user's profile picture URL
app.post('/update-profile-picture', authMiddleware, async (req, res) => {
    const { userId, imageUrl } = req.body;
    try {
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).send({ message: 'User not found.' });
      }
      user.profilePictureUrl = imageUrl;
      await user.save();
      res.json({ message: 'Profile picture updated successfully' });
    } catch (error) {
      console.error('Error updating profile picture:', error);
      res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
  });

  app.post('/send-message', authMiddleware, async (req, res) => {
    try {
        const senderId = req.user && req.user.userId;
        const { message, type } = req.body;

        if (!message) {
            return res.status(400).json({ message: 'Message content is required' });
        }

        const newMessage = new ChatMessage({
            sender: senderId,
            message: message,
            type: type
            // Add other fields if necessary
        });

        await newMessage.save();
        res.status(201).json({ message: 'Message sent successfully', newMessage });
    } catch (error) {
        console.error('Error sending message:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});


app.get('/get-messages', authMiddleware, async (req, res) => {
    try {
        // Modify the query as needed, e.g., filter by chat room or recipient
        const messages = await ChatMessage.find()
            .populate({
                path: 'sender',
                select: 'name profilePictureUrl', 
            })
            .sort({ timestamp: 1 });   // Sort by timestamp, newest first
        res.json(messages);
    } catch (error) {
        console.error('Error fetching messages:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});


app.post('/change-passsword', authMiddleware, async (req, res) => {
    try {
      const { current_password, new_password } = req.body;
      const userId = req.user.userId;
      const user = await User.findById(userId);
  
      if (!user) {
        return res.status(400).json({ message: "Invalid email or password." });
      }
  
      // Check password
      const isMatch = await bcrypt.compare(current_password, user.password);
  
      if (!isMatch) {
        return res.status(400).json({ message: "Password Incorrect" });
      }
  
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(new_password, saltRounds);

    // user table update wit hhashed password and jwt logot
  
        return res.status(200).json({ message: "changed pasworsd" });
    
    } catch (err) {
      console.error("Error during login:", err);
      res.status(500).json({ message: "Server error." });
    }
  });


  // api to get winner and loser data 
  app.get('/game-outcome', authMiddleware, async (req, res) => {
    const userId = req.user && req.user.userId;
    const { gameId } = req.query;

    console.log("UserId:", userId); // Debug log
    console.log("GameId:", gameId); 

    if (!userId || !gameId) {
        return res.status(400).json({ message: 'User ID and Game ID are required' });
    }

    try {
        const userBid = await UserBid.findOne({ user: userId, game: gameId }).exec();
        if (!userBid) {
            return res.json({ participated: false });
        }

        const game = await Game.findById(gameId).exec();
        if (!game) {
            return res.status(404).json({ message: 'Game not found' });
        }

        const gameEnded = game.hasEnded;
        console.log('gameEnded',gameEnded)

        if (!gameEnded) {
            return res.json({ participated: true, gameInProgress: true });
        }

        // Perform calculations only if the game has ended
        const won = game.winning_color === userBid.coin_type;
        const outcome = won ? 'win' : 'loss';
        const amount = userBid.bid_amount;
        const winningAmount = won ? amount * 2 : 0;
        const losingAmount = won ? 0 : amount;

        res.json({ participated: true, outcome, winningAmount, losingAmount, gameEnded });
    } catch (error) {
        console.error('Error fetching game outcome:', error);
        res.status(500).json({ message: 'Internal Server Error', error: error.message });
    }
});





  

app.use((error, req, res, next) => {
    console.error('Unhandled Error:', error);
    res.status(500).json({ message: 'Unhandled error', details: error.message, stack: error.stack });
});

app.listen(port, '0.0.0.0', () => {
    console.log(`Server running at localhost:${port}/`);
});


