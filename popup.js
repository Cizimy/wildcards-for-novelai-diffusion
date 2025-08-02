// NovelAI Wildcards – popup.js
const fileInput = document.getElementById('file');
const list      = document.getElementById('list');
const v3chk     = true; // document.getElementById('v3mode');

fileInput.addEventListener('change', () => {
  const files = Array.from(fileInput.files);
  if (!files.length) return;

  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};

    let remaining = files.length;
    files.forEach(f => {
      // Enhanced: Support hierarchical file names (scene_indoor.txt, lighting_natural.txt)
      const key = f.name.replace(/\.[^.]+$/, '');

      const reader = new FileReader();
      reader.onload = () => {
        // Store with original key but display hierarchically
        map[key] = reader.result;
        if (--remaining === 0) {
          chrome.storage.local.set({ wildcards: map }, refresh);
        }
      };
      reader.readAsText(f);
    });
  });
  fileInput.value = '';
});

function refresh() {
  chrome.storage.local.get('wildcards', d => {
    const map = d.wildcards || {};
    list.innerHTML = '';

    const oldBtn = document.getElementById('del-all-btn-container');
    if(oldBtn) oldBtn.remove();

    if (Object.keys(map).length > 0) {
      const buttonContainer = document.createElement('div');
      buttonContainer.id = 'del-all-btn-container';
      buttonContainer.style.textAlign = 'right';
      buttonContainer.style.marginBottom = '10px';

      const delAll = document.createElement('button');
      delAll.textContent = 'delete all';
      delAll.onclick = () => {
        if (!confirm('Are you sure you want to delete all wildcards?')) return;
        chrome.storage.local.set({ wildcards: {} }, refresh);
      };
      buttonContainer.appendChild(delAll);
      list.parentNode.insertBefore(buttonContainer, list);
    }

    // Enhanced: Group wildcards by hierarchy and display them organized
    const groupedWildcards = {};
    
    Object.keys(map).forEach(name => {
      // Use original key format for both storage and display
      const parts = name.split(/[\/_-]/);
      
      if (parts.length > 1) {
        const category = parts[0];
        if (!groupedWildcards[category]) {
          groupedWildcards[category] = [];
        }
        groupedWildcards[category].push(name);
      } else {
        if (!groupedWildcards['_root']) {
          groupedWildcards['_root'] = [];
        }
        groupedWildcards['_root'].push(name);
      }
    });

    // Display organized wildcards
    Object.keys(groupedWildcards).sort().forEach(category => {
      if (category !== '_root') {
        const categoryHeader = document.createElement('h4');
        categoryHeader.textContent = `${category}_`;
        categoryHeader.style.margin = '10px 0 5px 0';
        categoryHeader.style.color = '#666';
        categoryHeader.style.fontSize = '14px';
        list.appendChild(categoryHeader);
      }
      
      groupedWildcards[category].sort().forEach(name => {
        const li = document.createElement('li');
        li.textContent = `${name}.txt`;
        li.style.paddingLeft = category !== '_root' ? '15px' : '0px';
        
        const del = document.createElement('button');
        del.textContent = 'delete';
        del.onclick = () => {
          delete map[name];
          chrome.storage.local.set({ wildcards: map }, refresh);
        };
        li.appendChild(del);
        list.appendChild(li);
      });
    });
  });
}

// 0. 새 체크박스 핸들러 ───────────────────────────
const preserveChk = document.getElementById('preservePrompt');

// 저장값 → 체크박스 반영
chrome.storage.local.get('preservePrompt', d => {
  preserveChk.checked = !!d.preservePrompt;
});

// 체크 변경 → 저장
preserveChk.addEventListener('change', () => {
  chrome.storage.local.set({ preservePrompt: preserveChk.checked });
});

document.addEventListener('DOMContentLoaded', refresh);
