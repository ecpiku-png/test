# SalesDesk — HTML, CSS i JavaScript

Aplikacja do analizy wyników przedstawicieli handlowych działająca w przeglądarce. Logika, importy, konta demonstracyjne i zapis danych są napisane w JavaScript. Nie wymaga Pythona, SQLite, backendu ani pobierania bibliotek z Internetu.

## Uruchomienie

Najprościej otworzyć **`salesdesk.html`** w aktualnej przeglądarce. Ten plik zawiera cały HTML, CSS i JavaScript. Alternatywnie można otworzyć `web/index.html` — wraz z pozostałymi plikami katalogu `web`.

Jeżeli przeglądarka lub jej polityka blokuje lokalne pliki, użyj opcjonalnego serwera statycznego:

```bash
npm start
```

Serwer Node.js udostępnia wyłącznie pliki na porcie 3000. Nie obsługuje API i nie przechowuje danych aplikacji. Można też udostępnić katalog `web` przez dowolny hosting statyczny z HTTPS. `PORT` i `HOST` zmieniają adres serwera. Node.js 20+ jest potrzebny tylko do serwera, budowania pojedynczego pliku i testów; aplikacja w przeglądarce go nie wymaga. Nie trzeba wykonywać `npm install`.

## GitHub Pages

Repozytorium zawiera workflow `.github/workflows/pages.yml`. Publikuje katalog `web` po każdym pushu na `main`, po pomyślnym przejściu testów. Aplikacja używa względnych ścieżek i działa również pod prefiksem repozytorium `/test/`. Nie wymaga serwera Node.js na GitHub Pages.

Pierwsze uruchomienie:

1. Otwórz **Settings → Pages** w repozytorium.
2. W **Build and deployment → Source** wybierz **GitHub Actions**.
3. W **Actions → Deploy SalesDesk to GitHub Pages** wybierz **Run workflow**, jeśli konfiguracja została włączona po ostatnim pushu.
4. Po udanym wdrożeniu strona będzie dostępna pod adresem **https://ecpiku-png.github.io/test/**.

Alternatywnie można wybrać **Deploy from a branch**, gałąź `main` i katalog `/ (root)`. W głównym katalogu jest wygenerowany `index.html` zawierający całą aplikację oraz `.nojekyll`. Przy tej metodzie workflow Actions nie jest potrzebny i można go wyłączyć, aby nie uruchamiać drugiej ścieżki publikacji.

Po zmianach w źródłach wykonaj `npm run build` i dodaj wygenerowane `index.html` oraz `salesdesk.html` do commita. Wersja lokalna i wersja GitHub Pages mają oddzielne dane przeglądarki; dane można przenieść za pomocą kopii JSON.

## Pliki

| Plik | Zawartość |
| --- | --- |
| `index.html` | Strona startowa do publikacji z głównego katalogu repozytorium |
| `salesdesk.html` | Samodzielna aplikacja, wygodna do skopiowania i otwarcia |
| `web/index.html` | Struktura interfejsu |
| `web/style.css` | Responsywny wygląd |
| `web/app.js` | Dashboard, wykresy SVG, filtry, widoki i obsługa formularzy |
| `web/store.js` | Dane demonstracyjne, localStorage, lokalne konta, CSV i kopie JSON |
| `static-server.cjs` | Opcjonalny serwer statyczny w Node.js |

Po zmianie źródeł odśwież samodzielny plik:

```bash
npm run build
```

## Funkcje

- Dashboard z KPI, trendem i strukturą sprzedaży.
- Filtry miesiąca lub zakresu dat, zespołu, regionu, przedstawiciela i kategorii.
- Porównanie przedstawicieli, sortowanie, wyszukiwanie, profile i paginowane transakcje.
- Cele miesięczne, potwierdzenie edycji i historia zmian.
- Import CSV: mapowanie kolumn, walidacja, podgląd, raport błędów i duplikaty.
- Aktualizacja istniejących transakcji z jawnym potwierdzeniem.
- Eksport CSV zgodny z wybranymi filtrami i widokiem roli.
- Tworzenie i wyłączanie lokalnych kont demonstracyjnych.
- Pobieranie i odtwarzanie kopii danych JSON z ekranu administratora.

## Dane lokalne i role

Przy pierwszym uruchomieniu powstają przykładowe dane sześciu przedstawicieli z ostatnich siedmiu miesięcy. Zmiany są zapisywane pod kluczem `salesdesk.browser.v1` w **localStorage**. Lokalna sesja znajduje się w sessionStorage i zachowuje się po odświeżeniu karty. Dane nie są wysyłane do serwera.

Dane są osobne dla każdej przeglądarki, profilu i adresu aplikacji. Przeniesienie pliku lub zmiana adresu hostingu może utworzyć inny obszar danych. Zachowanie localStorage dla adresów `file://` zależy od przeglądarki; jeśli potrzebujesz stałego adresu, użyj hostingu statycznego lub lokalnego serwera. Wyczyszczenie pamięci przeglądarki usuwa dane. W razie blokady pamięci albo braku miejsca aplikacja zgłasza błąd zamiast potwierdzać zapis. Zalecana jest praca w jednej karcie; nie ma synchronizacji między komputerami ani współdzielonej bazy.

Konta i role **służą do demonstracji widoków, nie do ochrony danych**. Użytkownik mający dostęp do przeglądarki może odczytać lub zmienić localStorage. Hasła lokalnych kont są zapisane jako PBKDF2 SHA-256 z indywidualną solą, ale nie zastępuje to uwierzytelniania po stronie serwera. Nie używaj w tym demo poufnych danych ani haseł z innych usług. Funkcje kont wymagają Web Crypto, dostępnego w aktualnych przeglądarkach dla lokalnych plików, localhost i HTTPS.

### Konta demonstracyjne

Wspólne hasło: `Demo2026!`. Na ekranie logowania można też wybrać przycisk roli.

| E-mail | Widok demo |
| --- | --- |
| `dyrektor@demo.pl` | Wszystkie wyniki, cele i historia |
| `kierownik@demo.pl` | Zespół Północ, cele i własna historia |
| `anna@demo.pl` | Wyniki i cele Anny Kowalskiej |
| `admin@demo.pl` | Wszystkie wyniki, cele, import, konta i kopie danych |

## Reguły obliczeń

Kwoty są przechowywane jako całkowite grosze. Wskaźniki uwzględniają dokumenty `approved`. Sprzedaż netto obejmuje korekty i ujemne zwroty; liczba transakcji obejmuje unikalne dokumenty `sale`. Średnia to sprzedaż netto podzielona przez tę liczbę. Brak transakcji i zerowa podstawa porównania są oznaczane jako „—”.

Bieżący miesiąc jest porównywany z analogicznym zakresem dni poprzedniego miesiąca. Realizacja celu odnosi się do całego miesięcznego planu, bez proporcjonowania. Przy własnym zakresie dat albo filtrze kategorii nie jest obliczana. Brak choć jednego celu uniemożliwia obliczenie realizacji celu całego zespołu. Historia zapisuje czas UTC.

## Import CSV

Szablon jest dostępny w aplikacji. Kodowanie UTF-8, separator przecinek lub średnik. Obsługiwane są pola w cudzysłowach, cudzysłowy podwójne i wielowierszowe nazwy. Maksymalnie 4 MB i 10 000 rekordów na import.

```csv
id,date,rep_id,client,amount,currency,status,kind,category
FV-001,2026-10-01,r1,Nova Retail,1500.00,PLN,approved,sale,Usługi
ZW-001,2026-10-02,r1,Nova Retail,-200.00,PLN,approved,return,Usługi
```

- `id`: unikalny identyfikator dokumentu, nie pozycji; pozycje należy wcześniej zagregować.
- `date`: poprawna data RRRR-MM-DD.
- `rep_id`: r1–r6; przypisane nazwiska są widoczne w imporcie.
- `amount`: wartość netto, maksymalnie dwa miejsca po przecinku.
- `currency`: PLN.
- `status`: approved, pending lub cancelled.
- `kind`: sale, return lub correction; zwrot ma kwotę niedodatnią.
- `category`: pole opcjonalne.

Import z błędami nie zapisuje żadnych rekordów. Identyczne dokumenty są pomijane; zmienione dokumenty z tym samym ID wymagają potwierdzenia. Eksport zabezpiecza teksty mogące uruchomić formuły w arkuszu.

## Kopie i odtworzenie

Administrator otwiera **Kopie danych → Pobierz kopię danych**. Plik JSON zawiera sprzedaż, cele, historię oraz lokalne konta z hashami haseł. Odtworzenie wymaga wyboru pliku, walidacji i potwierdzenia zastąpienia bieżących danych; następnie aplikacja wylogowuje użytkownika. Niepoprawna kopia nie nadpisuje danych.

Stara baza `.data/sales.sqlite3`, jeśli istnieje po wersji Pythona, pozostaje nienaruszona. Ta wersja jej nie odczytuje ani nie migruje automatycznie.

## Testy

```bash
npm test
node --check web/app.js
node --check web/store.js
```

11 testów sprawdza obliczanie groszy, CSV, lokalne sesje, widoki ról, cele, trwałość danych, duplikaty, korekty, konta, eksport, kopie i błędy pamięci. Testy używają własnej pamięci zamiast danych użytkownika.

Test interfejsu (wymaga dostępnych Playwright i Chromium):

```bash
npm run test:browser
```

Uruchamia osobny serwer statyczny na porcie 3101 pod prefiksem `/test/`, odpowiadającym GitHub Pages, i nowy profil przeglądarki. Sprawdza wszystkie widoki, odświeżenie danych, import, eksport, kopie JSON, działanie offline po załadowaniu, samodzielny HTML i wersję mobilną. `CHROMIUM_PATH` wskazuje przeglądarkę, a `WEB_TEST_PORT` zmienia port. Bezpośredni test lokalnego pliku można uruchomić z `WEB_TEST_FILE=1`, o ile polityka przeglądarki dopuszcza `file://`; przeglądarka w tym środowisku blokuje ten schemat.

## Zakres

To samodzielne demo aplikacji, bez produkcyjnych uprawnień, wspólnej bazy, CRM/ERP, wielu walut, SSO i resetowania haseł. Nie wykonano testów obciążenia dla 100 tys. rekordów. Konfiguracja publikacji jest przygotowana; stan wdrożenia sprawdzisz w zakładce Actions.
