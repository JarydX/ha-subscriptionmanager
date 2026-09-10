# 💳 Home Assistant Subscription Manager

[![hacs_badge](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://github.com/hacs/default)
[![Validate Integration](https://github.com/JarydX/ha-subscriptionmanager/actions/workflows/validate.yaml/badge.svg)](https://github.com/JarydX/ha-subscriptionmanager/actions/workflows/validate.yaml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Subscription Manager** ist eine modulare Custom Integration für [Home Assistant](https://www.home-assistant.io/), mit der du all deine regelmäßigen Abonnements, Mitgliedschaften und Verträge (Streaming, Software, Fitness, Versicherungen, Internet etc.) direkt in Home Assistant erfassen, überwachen und budgetieren kannst.

Die Integration liefert ein interaktives **Lovelace-Übersichtswidget** mit Sortierung nach Kündigungsfristen, Kosten oder Fälligkeit sowie einen **Automation Blueprint** für automatische Push-Benachrichtigungen aufs Smartphone.

---

## ✨ Features

- 📱 **100% GUI-gesteuert (Config Flow)**: Kein YAML-Kauderwelsch! Abos werden einfach über die Benutzeroberfläche angelegt, per Klick geändert (Options Flow) oder gelöscht.
- 💰 **Kostenanalyse**: Berechnet automatisch die monatlichen und jährlichen Gesamtausgaben über alle aktiven Verträge.
- ⏳ **Laufzeiten & Kündigungsfristen (optional)**: Erfasse neben dem Abrechnungsintervall (wöchentlich, monatlich, quartalsweise, halbjährlich, jährlich) auf Wunsch auch Kündigungsfristen und Mindestvertragslaufzeiten.
- 💳 **Zahlungsmethoden**: Tracke, worüber abgebucht wird (PayPal, Kreditkarte, SEPA-Lastschrift, Apple Pay, Google Pay, Rechnung etc.).
- 🗂️ **Lovelace-Übersichtswidget mitgeliefert**: Eine schicke, interaktive Dashboard-Karte (`subscription-manager-card`), die direkt mit der Integration gebündelt wird – mit Live-Sortierung nach:
  - **Fälligkeit** (Was wird als Nächstes abgebucht?)
  - **Kündigungsfrist** (Welche Frist läuft bald ab?)
  - **Kosten** (Höchste Kosten zuerst)
  - **Name** (A-Z)
- 🔔 **Smarte Benachrichtigungen**: Mitgelieferter Automation-Blueprint für Smartphone-Push-Warnungen vor Abbuchungen oder Ablauf von Kündigungsfristen.

---

## 📦 Installation

### Über HACS (Empfohlen)

1. Öffne **HACS** in deinem Home Assistant.
2. Klicke oben rechts auf das Dreipunkt-Menü -> **Benutzerdefinierte Repositories**.
3. Füge dieses Repository hinzu:
   - **Repository**: `https://github.com/JarydX/ha-subscriptionmanager`
   - **Typ**: `Integration`
4. Suche nach **Subscription Manager** und klicke auf **Herunterladen**.
5. Starte Home Assistant neu.

### Manuell

1. Lade das Repository als ZIP herunter.
2. Kopiere den Ordner `custom_components/subscription_manager` in dein Home Assistant Verzeichnis unter `/config/custom_components/`.
3. Starte Home Assistant neu.

---

## ⚙️ Einrichtung in Home Assistant

1. Gehe in Home Assistant zu **Einstellungen -> Geräte & Dienste**.
2. Klicke auf **Integration hinzufügen** und wähle **Subscription Manager** aus.
3. Klicke auf **Absenden**, um die Integration als zentralen Hub einzurichten.
   - **Wichtig**: Die Integration landet sauber unter **Integrationen** und **nicht** bei den Helfern!
4. Klicke nun auf der Integrations-Kachel auf **Konfigurieren**:
   - ➕ **Abonnement hinzufügen**: Neues Abo anlegen (Name, Kosten, Abrechnungsintervall, Startdatum, Zahlungsmethode, optionale Kündigungsfrist).
   - ✏️ **Abonnement bearbeiten**: Konditionen bestehender Abos anpassen.
   - 🗑️ **Abonnement löschen**: Abos entfernen (alle zugehörigen Sensoren werden automatisch entfernt).
5. Jedes angelegte Abo erhält automatisch ein eigenes virtuelles Gerät mit allen Sensoren in Home Assistant.


---

## 📊 Dashboard Widget (`subscription-manager-card`)

Die Integration bringt eine interaktive Dashboard-Karte direkt mit. Damit Home Assistant die Karte lädt, trägst du sie einmalig als Dashboard-Ressource ein:

### 1. Karte als Ressource registrieren (einmalig)

1. Gehe in Home Assistant zu **Einstellungen -> Dashboards**.
2. Klicke oben rechts auf das **Dreipunkt-Menü** und wähle **Ressourcen** aus.
3. Klicke unten rechts auf **+ Ressource hinzufügen**.
4. Fülle die Felder aus:
   - **URL**: `/subscription_manager/subscription-manager-card.js`
   - **Ressourcentyp**: `JavaScript-Modul`
5. Klicke auf **Erstellen**.
6. Lade das Dashboard im Browser einmalig mit **`Strg + F5`** (bzw. `Cmd + Shift + R` auf Mac) neu.

---

### 2. Karte zum Dashboard hinzufügen

Klicke im Dashboard auf **+ Karte hinzufügen**, suche nach **Subscription Manager Card** (oder wechsle in den Code-Editor):

```yaml
type: custom:subscription-manager-card
title: Meine Abonnements
show_summary: true
show_sorting: true
```


### Konfigurations-Optionen:

| Parameter | Typ | Standard | Beschreibung |
|---|---|---|---|
| `title` | string | `'Abonnements'` | Titel der Lovelace Card |
| `show_summary` | boolean | `true` | Zeigt Monats-/Jahresgesamtsumme und Abo-Anzahl oben |
| `show_sorting` | boolean | `true` | Zeigt Umschalt-Buttons (Fälligkeit, Kündigungsfrist, Kosten, Name) |
| `entity` | string | `sensor.subscriptions_overview_summary` | Optional: Manuelle Angabe der Summary-Entität |

---

## 🔔 Benachrichtigungen einrichten (Blueprint)

Ein fertiger Blueprint für Home Assistant Automations ist im Ordner `blueprints/automation/subscription_reminder.yaml` enthalten.

1. Gehe in Home Assistant zu **Einstellungen -> Automationen & Szenen -> Blueprints**.
2. Klicke auf **Blueprint importieren** und gib den Pfad zur Blueprint-Datei oder GitHub-URL an.
3. Erstelle aus dem Blueprint eine Automation:
   - Wähle dein Smartphone als **Benachrichtigungs-Gerät** aus.
4. Fertig! Du wirst nun automatisch informiert:
   - Sobald die Kündigungsfrist eines Abos ansteht.
   - Vor der nächsten Verlängerung/Abbuchung inklusive Betrag und Zahlungsmethode.

---

## 🧩 Erzeugte Entitäten

Pro Abonnement (Gerät):
- `sensor.<name>_next_payment`: Nächstes Zahlungsdatum (`date`)
- `sensor.<name>_days_until_renewal`: Verbleibende Tage bis zur Abrechnung (`measurement`, Tage)
- `sensor.<name>_cost`: Betrag pro Intervall (`monetary`)
- `sensor.<name>_monthly_cost`: Umgerechnete Monatskosten zur Budgetierung (`monetary`)
- `sensor.<name>_payment_method`: Zahlungsmethode (PayPal, Kreditkarte etc.)
- `sensor.<name>_cancellation_deadline`: *(falls konfiguriert)* Kündigungsstichtag (`date`)
- `sensor.<name>_days_until_cancellation`: *(falls konfiguriert)* Verbleibende Tage bis Kündigungsfrist
- `binary_sensor.<name>_renewal_due`: `on` wenn Verlängerung oder Kündigungsfrist innerhalb der Vorwarnzeit liegt

Globale Auswertung:
- `sensor.subscriptions_total_monthly_cost`: Gesamtkosten aller Verträge pro Monat
- `sensor.subscriptions_total_yearly_cost`: Gesamtkosten hochgerechnet aufs Jahr
- `sensor.subscriptions_active_count`: Anzahl aktiver Abonnements
- `sensor.subscriptions_summary`: Vollständige Datenstruktur für das Lovelace-Widget

---

## 🧪 Tests

```bash
python3 -m unittest discover tests
```

---

## 📄 Lizenz

Dieses Projekt ist unter der [MIT Lizenz](LICENSE) lizenziert.
