const User = require('../models/User');
const { generateTokenPair, verifyRefreshToken } = require('../utils/jwt');
const { sendSuccess, sendError } = require('../utils/apiResponse');
const logger = require('../utils/logger');

const register = async (req, res, next) => {
  try {
    const { name, email, password, phone, role } = req.body;
    const normalizedRole = typeof role === 'string' ? role.toLowerCase().trim() : undefined;

    if (normalizedRole && !['owner', 'admin'].includes(normalizedRole)) {
      return sendError(res, { statusCode: 400, message: 'Invalid role provided.' });
    }

    const existingUser = await User.findOne({ email });
    if (existingUser) return sendError(res, { statusCode: 409, message: 'Email already registered.' });

    const userPayload = { name, email, password, phone };
    if (normalizedRole) userPayload.role = normalizedRole;
    const user = await User.create(userPayload);
    const { accessToken, refreshToken } = generateTokenPair(user._id);

    user.refreshTokens.push({ token: refreshToken });
    user.lastLogin = new Date();
    await user.save();

    logger.info(`✅ New user registered: ${email}`);

    return sendSuccess(res, {
      statusCode: 201,
      message: 'Account created successfully',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) { next(error); }
};

const login = async (req, res, next) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email }).select('+password');

    if (!user || !(await user.comparePassword(password))) {
      return sendError(res, { statusCode: 401, message: 'Invalid email or password.' });
    }
    if (!user.isActive) return sendError(res, { statusCode: 401, message: 'Account is deactivated.' });

    const { accessToken, refreshToken } = generateTokenPair(user._id);
    user.refreshTokens.push({ token: refreshToken });
    if (user.refreshTokens.length > 5) user.refreshTokens = user.refreshTokens.slice(-5);
    user.lastLogin = new Date();
    await user.save();

    logger.info(`🔑 User logged in: ${email}`);

    return sendSuccess(res, {
      message: 'Login successful',
      data: {
        user: { id: user._id, name: user.name, email: user.email, role: user.role },
        accessToken,
        refreshToken,
      },
    });
  } catch (error) { next(error); }
};

const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (!token) return sendError(res, { statusCode: 400, message: 'Refresh token is required.' });

    let decoded;
    try { decoded = verifyRefreshToken(token); }
    catch { return sendError(res, { statusCode: 401, message: 'Invalid or expired refresh token.' }); }

    const user = await User.findById(decoded.id);
    if (!user) return sendError(res, { statusCode: 401, message: 'User not found.' });

    const tokenExists = user.refreshTokens.some((t) => t.token === token);
    if (!tokenExists) return sendError(res, { statusCode: 401, message: 'Refresh token has been revoked.' });

    const { accessToken, refreshToken: newRefreshToken } = generateTokenPair(user._id);
    user.refreshTokens = user.refreshTokens.filter((t) => t.token !== token);
    user.refreshTokens.push({ token: newRefreshToken });
    await user.save();

    return sendSuccess(res, { message: 'Token refreshed', data: { accessToken, refreshToken: newRefreshToken } });
  } catch (error) { next(error); }
};

const logout = async (req, res, next) => {
  try {
    const { refreshToken: token } = req.body;
    if (token) {
      await User.updateOne({ _id: req.user._id }, { $pull: { refreshTokens: { token } } });
    }
    return sendSuccess(res, { message: 'Logged out successfully' });
  } catch (error) { next(error); }
};

const getMe = async (req, res, next) => {
  try {
    const user = await User.findById(req.user._id);
    return sendSuccess(res, {
      data: { id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, lastLogin: user.lastLogin },
    });
  } catch (error) { next(error); }
};

const updateMe = async (req, res, next) => {
  try {
    const allowedFields = ['name', 'phone'];
    const updates = {};
    allowedFields.forEach((field) => { if (req.body[field] !== undefined) updates[field] = req.body[field]; });
    const user = await User.findByIdAndUpdate(req.user._id, { $set: updates }, { new: true, runValidators: true });
    return sendSuccess(res, { message: 'Profile updated', data: { id: user._id, name: user.name, email: user.email, phone: user.phone } });
  } catch (error) { next(error); }
};

module.exports = { register, login, refreshToken, logout, getMe, updateMe };
