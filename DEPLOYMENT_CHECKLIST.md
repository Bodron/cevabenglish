# 🚀 Deployment Checklist pentru Autentificare Persistentă

## ✅ Ce am implementat:

### 1. **Endpoint-uri noi:**
- ✅ `POST /api/auth/refresh` - Reîmprospătează token-urile
- ✅ `GET /api/activity/days` - Zilele cu activitate
- ✅ `GET /api/review/ready` - Cuvinte de revizuit
- ✅ `GET /api/daily-progress` - Progres zilnic
- ✅ `POST /api/daily-progress/increment` - Incrementare progres

### 2. **Modele noi:**
- ✅ `DailyProgress` - Pentru tracking progres zilnic

### 3. **Controller-e actualizate:**
- ✅ `authController.js` - Refresh token logic
- ✅ `progressController.js` - Tracking activitate și progres

## 📋 Pași pentru deployment:

### 1. **Verifică variabilele de mediu (.env):**

Asigură-te că serverul de producție are toate acestea în `.env`:

```bash
NODE_ENV=production
PORT=5001
MONGODB_URI=mongodb://your-mongodb-connection-string
JWT_ACCESS_SECRET=your-secret-key-here
JWT_REFRESH_SECRET=your-refresh-secret-here
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CORS_ORIGIN=https://benglish.bcmenu.ro
BCRYPT_SALT_ROUNDS=12
```

**IMPORTANT:** 
- `JWT_ACCESS_SECRET` și `JWT_REFRESH_SECRET` trebuie să fie string-uri random foarte lungi
- Poți genera cu: `node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"`

### 2. **Instalează dependențele (dacă e nevoie):**

```bash
cd server
npm install
```

### 3. **Restartează serverul:**

```bash
# Dacă folosești PM2:
pm2 restart benglish-api

# Sau direct:
npm start
```

### 4. **Testează endpoint-ul de refresh:**

```bash
curl -X POST https://benglish.bcmenu.ro/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"refreshToken":"paste-a-valid-refresh-token-here"}'
```

Răspuns așteptat:
```json
{
  "user": {
    "_id": "...",
    "username": "...",
    "email": "..."
  },
  "accessToken": "new-jwt-token",
  "refreshToken": "new-refresh-token"
}
```

### 5. **Verifică că toate rutele noi funcționează:**

```bash
# Test activity days (cu token valid):
curl https://benglish.bcmenu.ro/api/activity/days \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Test review ready:
curl https://benglish.bcmenu.ro/api/review/ready?countOnly=1 \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"

# Test daily progress:
curl "https://benglish.bcmenu.ro/api/daily-progress?date=2025-11-16" \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 🔧 Troubleshooting:

### Problema: "JWT_ACCESS_SECRET is not set"
**Soluție:** Adaugă variabilele în `.env` pe server

### Problema: 404 Not Found pe /api/auth/refresh
**Soluție:** Restartează serverul după deploy

### Problema: Token refresh returnează 401
**Soluție:** 
- Verifică că `JWT_REFRESH_SECRET` este același ca cel folosit la generarea token-ului
- Verifică că token-ul nu a expirat (default: 7 zile)

### Problema: CORS errors
**Soluție:** Adaugă domeniul în `CORS_ORIGIN` din `.env`

## 🎯 Flow-ul complet după deployment:

1. **User se loghează** → primește `accessToken` + `refreshToken`
2. **Flutter salvează token-urile** în `flutter_secure_storage`
3. **User închide app-ul** → token-urile rămân salvate
4. **User redeschide app-ul** → Flutter:
   - Încarcă token-urile salvate
   - Apelează `/api/auth/refresh` cu `refreshToken`
   - Primește token-uri noi
   - Navighează direct la `IntroScreen` (skip login!)
5. **Dacă refresh token expiră** → User trebuie să se logheze din nou

## 📱 Verificare în producție:

După deployment:
1. Deschide app-ul pe iOS
2. Loghează-te
3. **Închide complet app-ul** (swipe din multitasking)
4. **Redeschide app-ul**
5. ✅ Ar trebui să intri direct în app fără login!

Dacă nu funcționează, verifică log-urile serverului pentru erori.

