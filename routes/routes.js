const express = require('express');
const Data = require('../models/serial');

const router = express.Router()

router.post('/callback', async (req, res) => {
    if (req.body.errCode == '00') {
        const data = new Data({
            batchId: req.body.result.batchId,
            procId: req.body.result.procId,
            serialNumber: req.body.result.serialNumber,
            qrImage: req.body.result.qrImage,
        })
    
        try{
            const dataToSave = await data.save();
            res.status(200).json(dataToSave)
        }
        catch(error){
            res.status(400).json({message: error.message})
        }
    }
    else
    {
        res.status(400).json({
            errCode: req.body.errCode,
            message: req.body.message,
            procId: req.body.result.procId,
            status: req.body.result.status,
        })
    }
})

router.get('/callback/batch', async (req, res) => {
    try{
        let f = 'batchId procId serialNumber qrImage createdAt';
        if(req.query.withQr=='false') {
            f = 'batchId procId serialNumber createdAt';
        }
        const data = await Data.find().select(f);
        res.json(data)
    }
    catch(error){
        res.status(500).json({message: error.message})
    }
})

router.get('/callback/batch/:batch', async (req, res) => {
    try{
        let f = 'batchId procId serialNumber qrImage createdAt';
        if(req.query.withQr=='false') {
            f = 'batchId procId serialNumber createdAt';
        }
        const data = await Data.find({batchId: req.params.batch}).select(f);
        res.json(data)
    }
    catch(error){
        res.status(500).json({message: error.message})
    }
})

router.get('/callback/count', (req, res) => {
    try{
        var b;
        Data.find({}).distinct("batchId", function(error, ids) {
            b = ids
        });
        var data = Data.find();
        data.count(function (err, count) {
            if (err) res.status(500).json({message: err.message})
            else res.json({"total": count, "batchIdList": b})
        });
    }
    catch(error){
        res.status(500).json({message: error.message})
    }
})


router.get('/callback/count/:batch', (req, res) => {
    try{
        var query = Data.find({batchId: req.params.batch});
        query.count(function (err, count) {
            if (err) res.status(500).json({message: err.message})
            else res.json({"batchId": req.params.batch, "count": count})
        });
    }
    catch(error){
        res.status(500).json({message: error.message})
    }
})

module.exports = router;