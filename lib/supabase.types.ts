export type Depot = {
  id: string;
  name: string;
  address: string | null;
  lat: number;
  lng: number;
  active: boolean;
  created_at: string;
};

export type Vehicle = {
  id: string;
  plate: string;
  type: 'van' | 'truck_small' | 'truck_large';
  max_load: number;
  active: boolean;
  created_at: string;
};

export type Driver = {
  id: string;
  name: string;
  employee_id: string | null;
  phone: string | null;
  vehicle_id: string | null;
  active: boolean;
  created_at: string;
  // join
  vehicle?: Vehicle;
};

export type RouteStatus = 'draft' | 'optimized' | 'in_progress' | 'completed' | 'cancelled';

export type Route = {
  id: string;
  date: string;
  depot_id: string | null;
  return_depot_id: string | null;
  departure_time: string;
  status: RouteStatus;
  total_deliveries: number;
  total_drivers: number;
  created_by: string | null;
  created_at: string;
  updated_at: string;
  // joins
  depot?: Depot;
  return_depot?: Depot;
};

export type RouteDriver = {
  id: string;
  route_id: string;
  driver_id: string;
  vehicle_id: string | null;
  departure_time: string | null;
  color: string | null;
  route_order: number | null;
  total_km: number | null;
  total_time_min: number | null;
  created_at: string;
  // joins
  driver?: Driver;
  vehicle?: Vehicle;
};

export type DeliveryStatus = 'pending' | 'in_route' | 'delivered' | 'failed';

export type Delivery = {
  id: string;
  route_id: string;
  route_driver_id: string | null;
  invoice: string;
  client_name: string | null;
  address: string;
  lat: number | null;
  lng: number | null;
  geocoded: boolean;
  stop_order: number | null;
  status: DeliveryStatus;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

export type EventType = 'delivered' | 'failed' | 'photo' | 'signature' | 'panic' | 'note' | 'route_started';

export type DeliveryEvent = {
  id: string;
  delivery_id: string;
  event_type: EventType;
  lat: number | null;
  lng: number | null;
  photo_url: string | null;
  signature_url: string | null;
  notes: string | null;
  created_at: string;
};
