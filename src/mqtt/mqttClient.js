const mqtt = require('mqtt');
const config = require('../config');
const logger = require('../utils/logger');

let mqttClient = null;

const connectMQTT = () => {
  logger.info(`Connecting to MQTT broker: ${config.mqtt.brokerUrl}`);

  mqttClient = mqtt.connect(config.mqtt.brokerUrl, {
    clientId: config.mqtt.clientId,
    username: config.mqtt.username,
    password: config.mqtt.password,
    clean: true,
    connectTimeout: 10000,
    reconnectPeriod: 5000,
    keepalive: 60,
    will: {
      topic: 'server/status',
      payload: JSON.stringify({ status: 'offline', timestamp: new Date().toISOString() }),
      qos: 1,
      retain: true,
    },
  });

  mqttClient.on('connect', () => {
    logger.info('MQTT broker connected');

    mqttClient.subscribe(config.mqtt.topics.telemetry, { qos: 1 }, (err) => {
      if (err) logger.error(`Failed to subscribe to telemetry: ${err.message}`);
      else logger.info(`Subscribed to telemetry topic: ${config.mqtt.topics.telemetry}`);
    });

    mqttClient.subscribe(config.mqtt.topics.status, { qos: 1 }, (err) => {
      if (err) logger.error(`Failed to subscribe to status: ${err.message}`);
      else logger.info(`Subscribed to status topic: ${config.mqtt.topics.status}`);
    });

    mqttClient.publish(
      'server/status',
      JSON.stringify({ status: 'online', timestamp: new Date().toISOString() }),
      { qos: 1, retain: true }
    );
  });

  mqttClient.on('message', async (topic, payload) => {
    let message;
    try {
      message = JSON.parse(payload.toString());
    } catch {
      logger.warn(`Non-JSON payload on topic: ${topic}`);
      return;
    }

    const parts = topic.split('/');
    const deviceIdFromTopic = parts.length >= 2 ? parts[1] : undefined;
    const messageTypeFromTopic = parts.length >= 3 ? parts[2] : undefined;

    const telemetryTopic = config.mqtt.topics.telemetry;
    const statusTopic = config.mqtt.topics.status;

    const isTelemetryTopic =
      messageTypeFromTopic === 'telemetry'
      || topic === telemetryTopic
      || (telemetryTopic.includes('+') && topic.endsWith('/telemetry'));

    const isStatusTopic =
      messageTypeFromTopic === 'status'
      || topic === statusTopic
      || (statusTopic.includes('+') && topic.endsWith('/status'));

    const deviceId = (message.serial || deviceIdFromTopic || '').toString().trim();

    logger.debug(`MQTT [${topic}]: ${JSON.stringify(message)}`);

    try {
      if (isTelemetryTopic) {
        const { handleTelemetry } = require('./handlers/telemetryHandler');
        await handleTelemetry(deviceId, message);
      } else if (isStatusTopic) {
        const { handleStatus } = require('./handlers/statusHandler');
        await handleStatus(deviceId, message);
      } else {
        logger.debug(`Ignoring MQTT message on unmatched topic: ${topic}`);
      }
    } catch (error) {
      logger.error(`MQTT handler error for ${topic}: ${error.message}`);
    }
  });

  mqttClient.on('error', (err) => logger.error(`MQTT error: ${err.message}`));
  mqttClient.on('close', () => logger.warn('MQTT connection closed'));
  mqttClient.on('reconnect', () => logger.info('MQTT reconnecting...'));

  return mqttClient;
};

const getMQTTClient = () => mqttClient;

const publishCommand = (deviceId, command) => {
  if (!mqttClient || !mqttClient.connected) {
    logger.error('Cannot publish command: MQTT not connected');
    return false;
  }

  const topic = `scooters/${deviceId}/command`;
  const payload = JSON.stringify({ ...command, timestamp: new Date().toISOString() });

  mqttClient.publish(topic, payload, { qos: 1 }, (err) => {
    if (err) logger.error(`Failed to publish to ${topic}: ${err.message}`);
    else logger.info(`Command sent to ${deviceId}: ${command.action}`);
  });

  return true;
};

module.exports = { connectMQTT, getMQTTClient, publishCommand };
