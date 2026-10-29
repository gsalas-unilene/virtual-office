# UNILENE login and 3D viewer
Branch: existing worktree; delivery: ask-on-risk; runners: pytest, Angular tests/build, Docker checks.

## Specs
S1. “Si ya lo agregue procedo, terminas el login y armas el 3D. Me avisas.”
S2. “Se tiene ademas cambios en las credenciales , se usa encript” and “Si lo tiene.”: validate the stored final SHA-256 using the supplied HMAC-SHA-512 then SHA-256 implementation and backend-only `SECRET_KEY_LOGIN`.
S3. “SELECT 
    CodUsuario,
    USUARIO,
    Clave
FROM SatelliteCore..TBMUsuario
WHERE CodUsuario >= 1” and “Se recomiendo almacenar las querys y que python las lea y no embeberlas.”
S4. “Cuando haga login debe mostrar el 3D Optimizado y con wraper empersarial.”
S5. “ahora no puedes leer, ni editar, ni eliminar credentials.sh tratalo como un .env”: only execute the private file when authorized; never reveal its values.

## Tasks
- T1 [S1–S3,S5] inline — Implement and test backend login, external SQL and secret injection. Risk: item 2. Pending; commit pending.
- T2 [S1,S4] inline — Integrate authenticated Angular shell and existing floor-4 viewer, test Docker delivery. Risk: items 2 and 5. Pending; commit pending.
- T3 [S1–S5] inline — Independent verification and end-to-end checks. Pending; commit pending.

## Log
L1. “Si ya lo agregue procedo, terminas el login y armas el 3D. Me avisas.”
L2. Existing backend has no authentication; `encript.py` hashes hexadecimal HMAC text. Existing floor-4 viewer expects document ownership and a root-relative GLB. Browser access must not imply authentication without server enforcement. User confirmed key is present in private credentials script; running containers do not yet receive it.
L3. A private local test sourced the operator-authorized credentials script and compared the supplied example with `encript.py`'s HMAC-SHA-512 followed by SHA-256 of lowercase hex. Result: `LOGIN_VECTOR_MISMATCH`. No secrets or calculated values printed. Authentication and viewer integration are blocked on confirming the algorithm, key and test vector belong together; do not implement a guessed verifier or simulated login.
L4. “no el ejemplo esta mal solo usa encript directamente da el valor esperado.” The user identifies the example as wrong and authorizes the supplied implementation as authoritative. The earlier example is not an acceptance vector.
L5. Added backend session login and parameterized external SQL, `SECRET_KEY_LOGIN` runtime injection, Angular enterprise shell, and authenticated Nginx access to the existing floor-4 viewer/model. Backend tests 10/10, Angular tests 3/3 and production build passed; runner tests 5/5. Docker rebuild succeeded; readiness HTTP 200, unauthenticated viewer/model 401, synthetic unknown user 401. An independent verifier found login validation leaked invalid password input; corrected with a generic 422 and verified its targeted recheck. The verifier did not independently execute the entire 3D/image flow; real-user login and rendered 3D remain unverified. Viewer build warned about a chunk exceeding 500 kB; optimization is not proven. Tasks remain pending until missing proof is observed; no work-unit commit made.
L6. “Estaremos en una intranet y vpn. Estara en produccion pero del intranet en un servidor ubuntu con docker. Paso mi usuario , validado, ademas el 3D se ve correctamente. Instala en MCP de Playwright en modo global para que lo tengas presente en cualquier otro proyecto aparte de este. Cualquier cambio ahora validado con el MCP de Playwright y dejame tiempo para logear de esa manera no expongo usuarios.” The user confirms a real-user login and visible 3D; full production security and performance proof remain pending.
L7. El backend se guardó en el commit `9154fc7`; las migraciones y el catálogo, en `aba4e77`. La validación independiente completa del visor y su rendimiento siguen pendientes.
