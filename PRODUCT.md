# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Stack

MVP: statik HTML/CSS/JS + JSON veri dosyaları (veritabanı yok), Cloudflare Workers Assets üzerinde. Üyelik ve katkı aşamasında PHP Laravel'e geçilecek; sayfalar Blade şablonlarına taşınacak. Ayrıntılar `roadmap.md`'de.

## Users

Birincil kullanıcı mahalle sakini: nöbetçi eczane, okul, esnaf, ulaşım gibi günlük mahalle bilgisine hızlıca ulaşmak istiyor. Sonraki aşamada giriş yapmış sakinler eksik mahalle ve bilgi önerebilecek.

## Product Purpose

Türkiye'deki her il, ilçe ve mahalle için tek adreste derli toplu bir mahalle rehberi. MVP yalnızca İstanbul'u kapsıyor; içinde yalnızca Ataşehir ilçesi ve Küçükbakkalköy mahallesi aktif.

## Positioning

Her mahallenin kendi subdomain'i (`kucukbakkalkoy.mahalle.si`) ve sade, derlenmiş bir sayfası var. Bilgi mahalleli katkısıyla eklenip moderasyonla güncel tutuluyor. Harita uygulamaları ve belediye siteleri bu ikisini birlikte sunmuyor.

## Capabilities and Constraints

- Hiyerarşi: il (`istanbul.mahalle.si`) → ilçe (`atasehir.mahalle.si`) → mahalle (`kucukbakkalkoy.mahalle.si`).
- Henüz aktif olmayan il, ilçe ve mahalleler listede görünür ama tıklanamaz; kum saati (⏳) ile "çok yakında" olarak işaretlenir.
- "Eksik mahalle ekle" yalnızca giriş yapmış kullanıcılara açık olacak (Laravel aşaması).
- Slug'lar ASCII ve küçük harf; ekranda doğru Türkçe yazım kullanılır.
- Bülten kaydı mevcut (Turnstile + D1).

## Brand Commitments

- Ad: mahalle.si. Arayüz dili Türkçe; ö, ş, ç, ı, ğ, ü doğru yazılır.
- Mevcut görsel dil (turkuaz, turuncu, lacivert; `public/styles.css`) korunur.

## Evidence on Hand

- Ataşehir'in 17 mahallesinin adları.
- Kategori sayıları ("24 Okul", "18 Mağaza" vb.) yer tutucudur, gerçek veri değildir. Gerçek sayı ya da yorum uydurulmamalıdır.

## Product Principles

1. Önce sakinin günlük ihtiyacı: bilgi iki dokunuşta bulunmalı.
2. Dürüst durum: hazır olmayan şey "çok yakında" olarak görünür, sahte içerikle doldurulmaz.
3. Topluluk katkısı moderasyonla güvenilir kalır.
4. Ölçeklenebilir yapı: bir mahalleyi açmak veri değişikliğidir, kod değişikliği değil.

## Accessibility & Inclusion

Hareket içeren her şey `prefers-reduced-motion` altında kapatılır. Pasif öğeler `aria-disabled` ile işaretlenir. Mobilde 390px genişlik desteklenir.
