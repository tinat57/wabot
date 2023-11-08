const mongoose = require('mongoose');

const newSchema = mongoose.Schema({
    key:String,
    meg:String
});
module.exports=mongoose.model('messages',newSchema);