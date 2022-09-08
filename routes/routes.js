const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const Data = require('../models/serial');
const jwt = require('jsonwebtoken');
const { isRegExp } = require('util');

const router = express.Router()
const clientId = 'ea09066c-3631-4fff-99c6-28c8f0d88607'
const clientSecret = '983fb95b-332a-46a1-b14f-fdeca9a713d2'
const ALGORITHM = "sha256"; // Accepted: any result of crypto.getHashes(), check doc dor other options
const SIGNATURE_FORMAT = "base64"; // Accepted: hex, latin1, base64

function getPublicKey() {
    const path = require("path");
    var pubKey = fs.readFileSync(path.resolve(__dirname, "certificate_publickey.pem"), 'utf-8');
    console.log("\n>>> Public key: \n\n" + pubKey);
    
    return pubKey;
}

function verifySignature(signature, data) {
    var publicKey = getPublicKey();
    var verify = crypto.createVerify(ALGORITHM);
    var signature = signature;

    console.log('\n>>> Signature:\n\n' + signature);

    verify.update(data);

    var verification = verify.verify(publicKey, signature, SIGNATURE_FORMAT);

    console.log('\n>>> Verification result: ' + verification.toString().toUpperCase());

    return verification;
}

function verifyHMAC(signature, data) {
    var hmac = crypto.createHmac('sha512', clientSecret);

    //passing the data to be hashed
    const validate = hmac.update(data).digest('hex');
    
    console.log(">> from header:", signature)
    console.log(">> from verify:", validate)
    
    if (signature == validate){
        return true
    }

    return false
}

function generateAccessToken(clientId, expire) {
    return jwt.sign({ clientId: clientId }, process.env.TOKEN_SECRET, { expiresIn: expire});
}

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        console.log(err)

        if (err) return res.status(403).json({message: "Not Authorized"})

        req.clientId = decoded.clientId

        next()
    })
}

router.post('/auth/token', async(req, res) => {
    if ( clientId !== req.headers['x-mandiri-key']) {
        return res.status(403).json({ message: "Invalid Client ID"})
    } 

    if ( !req.headers['x-signature']) {
        return res.status(403).json({ message: "Invalid Signature"})
    }

    if ( !req.headers['x-timestamp']) {
        return res.status(403).json({ message: "Invalid Timestamp"})
    }

    const ts = req.headers['x-timestamp']
    const data = clientId + "|" + ts
    const signature = req.headers['x-signature']
    if (verifySignature(signature, data)) {
        const exp = 900
        res.status(200).json({ accessToken: generateAccessToken(clientId, exp.toString() + 's'), tokenType: "Bearer", expiresIn: exp })
    } else  {
        res.status(403).json({ message: "Invalid Signature"})
    }
    
})

router.post('/customers/v1.0/ematerai/update', authenticate, (req, res) => {
    const signature = req.headers['x-signature']
    const meth = req.method
    const url = req.url
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    const body = JSON.stringify(req.body)
    const ts = req.headers['x-timestamp']
    const message = `${meth}:/openapi${url}:${token}:${body}:${ts}`;

    if (req.clientId == clientId) {
        console.log(req.clientId)
        if (verifyHMAC(signature, message)) {
            console.log(req.body)
            res.status(200).json({clientId: req.clientId, message: "OK"})
        } else {
            console.log(req.body)
            console.log(message)
            console.log("invalid signature")
            res.status(403).json({ message: "Invalid Signature"})
        }
    }
    else
        res.status(403).json({message: "Not Authorized"})
})

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