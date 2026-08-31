export interface TelegramUpdate {
  update_id: number;
  message?: {
    message_id: number;
    chat: { id: number; first_name?: string; username?: string };
    text?: string;
  };
  callback_query?: {
    id: string;
    from: { id: number; first_name?: string; username?: string };
    message?: { message_id: number; chat: { id: number } };
    data?: string;
  };
}

export interface Wilaya {
  id: number;
  name: string;
  name_ar: string;
}

export interface Zone {
  id: number;
  wilaya_id: number;
  name: string;
  name_ar: string;
}

export interface Donor {
  id?: string;
  chat_id: number;
  wilaya_id?: number | null;
  zone_id?: number | null;
  blood_type?: string | null;
  is_active?: boolean;
}