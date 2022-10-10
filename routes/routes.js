const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const Data = require('../models/serial');
const jwt = require('jsonwebtoken');

const router = express.Router()
const clientId = 'ea09066c-3631-4fff-99c6-28c8f0d88607'
const clientSecret = '983fb95b-332a-46a1-b14f-fdeca9a713d2'
const ALGORITHM = "sha256"; // Accepted: any result of crypto.getHashes(), check doc dor other options
const SIGNATURE_FORMAT = "base64"; // Accepted: hex, latin1, base64

function getPublicKey() {
    const path = require("path");
    const pubKey = fs.readFileSync(path.resolve(__dirname, "certificate_publickey.pem"), 'utf-8');

    return pubKey;
}

function verifySignature(sign, data) {
    const publicKey = getPublicKey();
    const verify = crypto.createVerify(ALGORITHM);
    const signature = sign;

    verify.update(data);
    const verification = verify.verify(publicKey, signature, SIGNATURE_FORMAT);

    console.log('\n>>> Signature Verification result: ' + verification.toString().toUpperCase());

    return verification;
}

function verifyHMAC(signature, data) {
    const hmac = crypto.createHmac('sha512', clientSecret);
    const validate = hmac.update(data).digest('hex');

    if (signature == validate) {
        console.log('\n>>> HMAC Verification result: TRUE');
        return true
    }
    console.log('\n>>> HMAC Verification result: FALSE');
    return false
}

function generateAccessToken(clientId, expire) {
    return jwt.sign({ clientId: clientId }, process.env.TOKEN_SECRET, { expiresIn: expire });
}

function authenticate(req, res, next) {
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]

    if (token == null) return res.sendStatus(401)

    jwt.verify(token, process.env.TOKEN_SECRET, (err, decoded) => {
        if (err) {
            console.log("middleware: JWToken not found or invalid");
            return res.status(403).json({ error: true, message: "Token Invalid or Not Authorized" })
        }
        req.clientId = decoded.clientId

        next()
    })
}

router.post('/auth/token', async (req, res) => {
    if (clientId !== req.headers['x-mandiri-key']) {
        return res.status(403).json({ error: true, message: "Invalid Client ID" })
    }

    if (!req.headers['x-signature']) {
        return res.status(403).json({ error: true, message: "Invalid Signature" })
    }

    if (!req.headers['x-timestamp']) {
        return res.status(403).json({ error: true, message: "Invalid Timestamp" })
    }

    const ts = req.headers['x-timestamp']
    const data = clientId + "|" + ts
    const signature = req.headers['x-signature']
    if (verifySignature(signature, data)) {
        const exp = 900
        res.status(200).json({ error: false, accessToken: generateAccessToken(clientId, exp.toString() + 's'), tokenType: "Bearer", expiresIn: exp })
    } else {
        res.status(403).json({ error: true, message: "Invalid Signature" })
    }

})

router.post('/customers/v1.0/ematerai/update', authenticate, async (req, res) => {
    if (!req.headers['x-signature']) {
        console.log("Signature not found")
        return res.status(403).json({ error: true, message: "Invalid Signature" })
    }

    if (!req.headers['x-timestamp']) {
        console.log("Timestamp not found")
        return res.status(403).json({ error: true, message: "Invalid Timestamp" })
    }

    const signature = req.headers['x-signature']
    const meth = req.method
    const url = req.url
    const authHeader = req.headers['authorization']
    const token = authHeader && authHeader.split(' ')[1]
    const body = JSON.stringify(req.body)
    const ts = req.headers['x-timestamp']
    const message = `${meth}:/api${url}:${token}:${body}:${ts}`;

    if (req.clientId == clientId) {
        if (verifyHMAC(signature, message)) {
            if (req.body[0].errCode == '00') {
                const data = new Data({
                    batchId: req.body[0].result.batchId,
                    procId: req.body[0].result.procId,
                    serialNumber: req.body[0].result.serialNumber,
                    qrImage: req.body[0].result.qrImage,
                })

                try {
                    const dataToSave = await data.save();
                    res.status(200).json({ error: false, message: "OK", result: dataToSave })
                }
                catch (error) {
                    res.status(400).json({ error: true, message: error.message })
                }
            }
        } else {
            console.log("Invalid signature")
            res.status(403).json({ error: true, message: "Invalid Signature" })
        }
    }
    else {
        console.log("Invalid clientId")
        res.status(403).json({ error: true, message: "Not Authorized" })
    }
})

router.post('/callback', async (req, res) => {
    if (req.body.errCode == '00') {
        const data = new Data({
            batchId: req.body.result.batchId,
            procId: req.body.result.procId,
            serialNumber: req.body.result.serialNumber,
            qrImage: req.body.result.qrImage,
        })

        try {
            const dataToSave = await data.save();
            res.status(200).json({ error: false, result: dataToSave })
        }
        catch (error) {
            res.status(400).json({ error: true, message: error.message })
        }
    }
    else {
        res.status(400).json({
            errCode: req.body.errCode,
            message: req.body.message,
            procId: req.body.result.procId,
            status: req.body.result.status,
        })
    }
})

router.get('/callback/list', async (req, res) => {
    try {
        const data = await Data.distinct("batchId");
        res.json({ error: false, total: data.length, result: data })
    }
    catch (error) {
        res.status(500).json({ error: true, message: error.message })
    }
})

router.get('/callback/batch', async (req, res) => {
    try {
        let f = 'batchId procId serialNumber qrImage createdAt';
        if (req.query.withQr == 'false') {
            f = 'batchId procId serialNumber createdAt';
        }
        const data = await Data.find().select(f);
        res.json({ error: false, total: data.length, result: data })
    }
    catch (error) {
        res.status(500).json({ error: true, message: error.message })
    }
})

router.get('/callback/batch/:batch', async (req, res) => {
    try {
        let f = 'batchId procId serialNumber qrImage createdAt';
        if (req.query.withQr == 'false') {
            f = 'batchId procId serialNumber createdAt';
        }
        const data = await Data.find({ batchId: req.params.batch }).select(f);
        res.json({ error: false, total: data.length, result: data })
    }
    catch (error) {
        res.status(500).json({ error: true, message: error.message })
    }
})

router.get('/callback/count', async (req, res) => {
    try {
        var b;
        Data.find({}).distinct("batchId", function (error, ids) {
            b = ids
        });
        var data = Data.find();
        data.count(function (err, count) {
            if (err) res.status(500).json({ error: true, message: err.message })
            else res.json({ error: false, "total": count, "batchIdList": b })
        });
    }
    catch (error) {
        res.status(500).json({ error: true, message: error.message })
    }
})

router.get('/callback/count/:batch', (req, res) => {
    try {
        var query = Data.find({ batchId: req.params.batch });
        query.count(function (err, count) {
            if (err) res.status(500).json({ error: true, message: err.message })
            else res.json({ error: false, "batchId": req.params.batch, "count": count })
        });
    }
    catch (error) {
        res.status(500).json({ error: true, message: error.message })
    }
})

module.exports = router;