Amacımız şu: **Dijital varlığı zayıf ama fiziksel/ticari potansiyeli yüksek** olan işletmelere en yüksek puanı verip satış ekibini onlara yönlendirmek; dijitalde zaten mükemmel olanları ise elemek.

İşte sistemi otonom hale getirecek, 100 üzerinden değerlendirilen ideal puanlama ve eylem matrisi:

### 1. Google İşletme (Haritalar) Puanlaması (Maksimum 50 Puan)

Google haritalar, işletmenin "bulunabilirliğini" gösterir. Buradaki eksiklikler, doğrudan Crevia'nın satabileceği hizmetlerdir.

| Kriter | Durum | Puan | Mantık |
| --- | --- | --- | --- |
| **İşletme Sahipliği** | Sahipsiz (Unclaimed) | **+20** | En sıcak fırsat. "Haritalarda varsınız ama kontrolünüzde değil, biz alalım" satışı. |
| **İşletme Sahipliği** | Sahiplenilmiş | 0 | - |
| **Yorum & Puan Durumu** | Puan < 3.5 veya Yorum < 10 | **+15** | İtibar yönetimi ve yoruma teşvik (QR menü, asansör reklamı vs.) ihtiyacı var. |
| **Yorum & Puan Durumu** | Puan > 4.5 ve Yorum > 100 | -10 | Zaten iyi yönetiliyor, zaman harcama. |
| **Eksik Bilgi** | Web sitesi veya Telefon Yok | **+15** | Kurumsal kimlik/web sitesi satış fırsatı. |

### 2. Instagram Puanlaması (Maksimum 50 Puan)

Instagram, işletmenin "vitrinidir". Buradaki zayıflık, sosyal medya yönetimi ve içerik üretimi satmak için mükemmel bir bahanedir.

| Kriter | Durum | Puan | Mantık |
| --- | --- | --- | --- |
| **Hesap Varlığı** | Hesap bulunamadı | **+20** | Sıfırdan hesap kurulumu ve marka inşası fırsatı. |
| **Son Paylaşım Tarihi** | > 30 Gün Önce | **+15** | Ajansı yok veya bırakmış. Tam araya girme vakti. |
| **Son Paylaşım Tarihi** | < 7 Gün İçinde | 0 | Aktif kullanıyor. |
| **Profil Kalitesi (Bio)** | Bio eksik, link yok, öne çıkanlar yok | **+15** | Profili profesyonelleştirme ihtiyacı. |
| **Rakip Filtresi** | Biyografide başka ajans adı var | **-50** | Sözleşmeli çalışıyorlar. Ekibi boşa yorma. |

---

### 3. Eylem ve Karar Matrisi (Sistem Ne Yapacak?)

Toplanan puanlara göre sistemin firmaları otomatik olarak hangi havuza atacağı ve nasıl aksiyon alacağı:

* **🔥 75 - 100 Puan: Kırmızı Alarm (Saha Ziyareti - Pzt/Çarş)**
* **Durum:** İşletme açıkça yardıma muhtaç. Web sitesi yok, haritalarda sahipsiz, Instagram'ı ölü.
* **Sistem Aksiyonu:** Doğrudan pazartesi veya çarşamba günkü saha satışçısının **Harita Rotasına** ekle. Bu müşteriye telefonla ulaşmak zordur (telefonu bile güncel olmayabilir), kapısına gidip "Sizi dijitalde var edelim" demek en yüksek dönüşümü sağlar.


* **☀️ 50 - 74 Puan: Sıcak Potansiyel (Telefonla Arama - Salı/Perş)**
* **Durum:** İşletme dijitalde var ama eksikleri bariz (Son post 2 ay önce atılmış, harita yorumları kötü).
* **Sistem Aksiyonu:** Salı/Perşembe günü ofisteki ekibin **Arama Listesine** (Call List) düşür.
* **Satış Argümanı:** *"Merhaba, Instagram hesabınızı inceledik, 2 aydır paylaşım yapmadığınızı fark ettik. Crevia olarak..."*


* **🌤️ 25 - 49 Puan: Ilık Potansiyel (Otonom Temas)**
* **Durum:** İşletme aktif sayılır ama belki içerik kalitesi düşük. Satışçının değerli vaktini (ziyaret veya arama) harcamaya değmeyebilir ama tamamen de çöpe atılmamalı.
* **Sistem Aksiyonu:** Bu gruba sistem otomatik bir "Soğuk E-posta (Cold Email)" veya Instagram üzerinden otomatik bir DM atar. Örneğin: *"İşletmenizin dijital analizini yaptık, ücretsiz raporunuzu görmek için tıklayın."* Eğer müşteri mesaja dönerse, sistem puanı otomatik olarak 75'e çekip saha ekibine yönlendirir.


* **❄️ 0 - 24 Puan: Pas Geç (Ignore)**
* **Durum:** Mükemmel yönetilen hesaplar, çok yüksek yorumlar veya başka bir ajansla (rakiple) çalışanlar.
* **Sistem Aksiyonu:** Veritabanına "Zaman Harcama" olarak kaydet. 6 ay sonra tekrar tara (belki ajansıyla yolları ayırır).



### Teknik Olarak Bu Nasıl Çalışacak?

Bunun için iki temel şeye ihtiyacımız olacak:

1. **Scraper (Veri Toplayıcı):** Google Places API (harita verileri için) ve Apify veya basit bir Python botu (Instagram'ın son post tarihini ve bio'sunu çekmek için).
2. **Cron Job (Zamanlanmış Görev):** Sistem her pazar gecesi İstanbul'un belirlediğin bir ilçesini tarayacak, puanları hesaplayacak ve pazartesi sabahı saha ekibinin önüne hazır, optimize edilmiş bir rota haritası çıkaracak.
