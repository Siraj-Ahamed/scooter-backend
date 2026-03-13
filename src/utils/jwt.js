const jwt = require('jsonwebtoken');
const config = require('../config');

const generateAccessToken = (userId) =>
  jwt.sign({ id: userId }, config.jwt.secret, { expiresIn: config.jwt.expire });

const generateRefreshToken = (userId) =>
  jwt.sign({ id: userId }, config.jwt.refreshSecret, { expiresIn: config.jwt.refreshExpire });

const verifyAccessToken = (token) => jwt.verify(token, config.jwt.secret);

const verifyRefreshToken = (token) => jwt.verify(token, config.jwt.refreshSecret);

const generateTokenPair = (userId) => ({
  accessToken: generateAccessToken(userId),
  refreshToken: generateRefreshToken(userId),
});

module.exports = { generateAccessToken, generateRefreshToken, verifyAccessToken, verifyRefreshToken, generateTokenPair };
