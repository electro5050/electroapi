const mongoose = require('mongoose');
const moment = require('moment-timezone');


const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: {
        type: String,
        unique: true,
        required: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address.']
    },
    userId: {
        type: String,
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    coinbalance:{
        type: Number,
        default: 10000
    },
    profilePictureUrl: { type: String }
});

userSchema.pre('save', function (next) {
    // Check if userId is not already set
    if (!this.userId) {
        // Extract the first 10 letters of the email without the domain
        const emailPrefix = this.email.slice(0, this.email.indexOf('@')).slice(0, 5);

        // Generate a unique identifier using uuidv4
        const uniqueId = uuidv4().slice(-4);

        // Combine the two parts to form the userId
        this.userId = emailPrefix + uniqueId;
    }

    next();
});

userSchema.virtual('UserId').get(function () {
    const emailPrefix =  this.email  ?  this.email.slice(0, this.email.indexOf('@')).slice(0, 10) : 'unknown';
    const idSuffix = this._id.toString().slice(-5);
    return emailPrefix + idSuffix;
});

userSchema.set('toJSON', { virtuals: true });

const User = mongoose.model('User', userSchema);

// Main Game schema
const gameSchema = new mongoose.Schema({
    start_time: {
        type: Date,
    },
    end_time: {
        type: Date,
    },
    winning_color: {
        type: String,
    },
    winners: {
        userId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
        },
        bidAmount: Number,
        winningBonus: Number
    }
});

// Add virtual fields for start_time and end_time in IST
gameSchema.virtual('start_time_ist').get(function() {
    return moment(this.start_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
});
gameSchema.virtual('end_time_ist').get(function() {
    return moment(this.end_time).tz('Asia/Kolkata').format('YYYY-MM-DD HH:mm:ss');
});

const Game = mongoose.model('Game', gameSchema);

// User Bid schema
const userBidSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    bid_amount: {
        type: Number,
    },
    coin_type: {
        type: String,
    },
    game: { 
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Game'
    }
});

const UserBid = mongoose.model('UserBid', userBidSchema);

// Notifications schema 
const notificationSchema = new mongoose.Schema({
    title: {
        type: String,
    },
    message: {
        type: String,
    },
    imageUrl: String,
    timestamp: {
        type: Date,
        default: Date.now
    }
});

const Notification = mongoose.model('Notification', notificationSchema);

const profilePictureSchema = new mongoose.Schema({
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    imageUrl: {
        type: String,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

const ProfilePicture = mongoose.model('ProfilePicture', profilePictureSchema);


const chatMessageSchema = new mongoose.Schema({
    sender: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    message: {
        type: String,
        required: true
    },
    timestamp: {
        type: Date,
        default: Date.now
    },
   
});

const ChatMessage = mongoose.model('ChatMessage', chatMessageSchema);

module.exports = { User, Game, UserBid, Notification,ProfilePicture,ChatMessage };
