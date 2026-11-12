// Before the 3D view loads: the pet always draws straight to a see-through canvas (no post passes).
try{localStorage.setItem('vinyl-quality','low');}catch{}
// Where the pet sits in the window, known before the first frame (so it is never drawn the size of the window).
try{const s=window.desk&&window.desk.initialStage,st=document.documentElement.style;
 if(s){st.setProperty('--px',s.ox+'px');st.setProperty('--py',s.oy+'px');st.setProperty('--pw',s.w+'px');st.setProperty('--ph',s.h+'px');document.documentElement.classList.add('staged');}}catch{}
