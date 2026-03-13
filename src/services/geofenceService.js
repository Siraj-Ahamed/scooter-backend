const { isPointInPolygon: geolibIsPointInPolygon, getDistance } = require('geolib');

const isPointInPolygon = (point, polygonRing) => {
  const geolibPolygon = polygonRing.map(([lng, lat]) => ({ latitude: lat, longitude: lng }));
  return geolibIsPointInPolygon({ latitude: point.lat, longitude: point.lng }, geolibPolygon);
};

const getDistanceMeters = (from, to) =>
  getDistance({ latitude: from.lat, longitude: from.lng }, { latitude: to.lat, longitude: to.lng });

const calculateRouteDistance = (points) => {
  if (points.length < 2) return 0;
  let totalMeters = 0;
  for (let i = 1; i < points.length; i++) totalMeters += getDistanceMeters(points[i - 1], points[i]);
  return parseFloat((totalMeters / 1000).toFixed(2));
};

module.exports = { isPointInPolygon, getDistanceMeters, calculateRouteDistance };
