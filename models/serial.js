const mongoose = require('mongoose');

const dataSchema = new mongoose.Schema({
    batchId: {
        required: true,
        type: String
    },
    procId: {
        required: true,
        type: String
    },
    serialNumber: {
        required: true,
        type: String
    },
    qrImage: {
        required: true,
        type: String
    }
})

module.exports = mongoose.model('SerialNumber', dataSchema)