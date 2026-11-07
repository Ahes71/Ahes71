# AKYMUN canlı site (Render + Supabase)

Canlı adres: https://akymun.onrender.com  
Supabase proje ref: `ujkfwtgzfsdtzmeicuzb`

## Veritabanı açılmıyor / permission denied

Supabase Auth ayakta; sorun tablolarda ve `is_staff` fonksiyonunda eksik `GRANT`.

1. [Supabase Dashboard](https://supabase.com/dashboard/project/ujkfwtgzfsdtzmeicuzb/sql/new) → SQL Editor  
2. `supabase/fix_permissions.sql` içeriğini yapıştırıp **Run**  
3. https://akymun.onrender.com sayfasını sert yenile

Başvuru gönderimi (`submit_application`) zaten çalışıyor; panel ve listeleme izinleri bu script ile açılır.
