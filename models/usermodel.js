const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: {
        type: String,
        unique: true,
        required: true,
        match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address.']
    },
    password: {
        type: String,
        required: true,
        minlength: 8
    },
    coinbalance:{
        type: Number,
        default: 10000
    }
});

module.exports = mongoose.model('User', userSchema);


// const mongoose = require('mongoose');

// const userSchema = new mongoose.Schema({
//     name: { type: String, required: true },
//     email: {
//         type: String,
//         unique: true,
//         required: true,
//         match: [/^\S+@\S+\.\S+$/, 'Please provide a valid email address.']
//     },
//     password: {
//         type: String,
//         required: true,
//         minlength: 8
//     },
//     coinbalance:{
//         type: Number,
//         default: 10000
//     }
// });

// const User = mongoose.model('User', userSchema);

// // Main Game schema
// const gameSchema = new mongoose.Schema({
//     start_time: {
//         type: Date,
//     },
//     end_time: {
//         type: Date,
//     },
//     winning_coin: {
//         type: String,
//     },
// });

// const Game = mongoose.model('Game', gameSchema);

// // User Bid schema
// const userBidSchema = new mongoose.Schema({
//     user: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'User',  // Reference to the User model
//         required: true,
//     },
//     bid_amount: {
//         type: Number,
//         required: true,
//     },
//     coin_type: {
//         type: String,
//         required: true,
//     },
//     game: { 
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Game',  // Reference to the Game model
//         required: true
//     }
// });

// const UserBid = mongoose.model('UserBid', userBidSchema);



// module.exports = { User, Game, UserBid };
