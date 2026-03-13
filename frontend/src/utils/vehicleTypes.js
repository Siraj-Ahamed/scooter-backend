// Vehicle type metadata — emoji, label, accent colour
export const VEHICLE_TYPES = [
  { value: 'scooter',    label: 'Scooter',    emoji: '\u{1F6F5}', color: '#00e5ff' },
  { value: 'motorcycle', label: 'Motorcycle', emoji: '\u{1F3CD}\uFE0F', color: '#ff6b35' },
  { value: 'car',        label: 'Car',        emoji: '\u{1F697}', color: '#00ff88' },
  { value: 'van',        label: 'Van',        emoji: '\u{1F690}', color: '#ffd700' },
  { value: 'truck',      label: 'Truck',      emoji: '\u{1F69A}', color: '#a78bfa' },
  { value: 'bicycle',    label: 'Bicycle',    emoji: '\u{1F6B2}', color: '#34d399' },
  { value: 'bus',        label: 'Bus',        emoji: '\u{1F68C}', color: '#f472b6' },
  { value: 'other',      label: 'Other',      emoji: '\u{1F698}', color: '#94a3b8' },
]

export const vehicleTypeMeta = (type) =>
  VEHICLE_TYPES.find(t => t.value === type) || VEHICLE_TYPES[VEHICLE_TYPES.length - 1]

export const vehicleEmoji = (type) => vehicleTypeMeta(type).emoji
export const vehicleColor = (type) => vehicleTypeMeta(type).color
export const vehicleLabel = (type) => vehicleTypeMeta(type).label
