
let clickMode = '';
const messageTextarea = document.getElementById('postForm')?.querySelector('#message');
function deletePost() {
  clickMode = clickMode !== 'post-del' ? 'post-del' : '';
  document.documentElement.style.cursor = clickMode ? 'crosshair' : 'default';

  // Toggle the 'deletion-mode' class on post elements
  const posts = document.querySelectorAll('.post, .post_reply, .post_catalog');
  posts.forEach(post => {
      post.classList.toggle('deletion-mode', clickMode === 'post-del');
  });

}
function deleteFile() {
  clickMode = clickMode !== 'file-del' ? 'file-del' : '';
  document.documentElement.style.cursor = clickMode ? 'crosshair' : 'default';

  const embeddedFiles = document.querySelectorAll('.embedded-file');
  embeddedFiles.forEach(file => {
    file.classList.toggle('deletion-mode', clickMode === 'file-del');
  });
}
let massSelectStartPost = null;
function exitClickModeOnce(event) {
  if (event.target.tagName !== 'BUTTON') {

    switch (clickMode) {
      case 'post-del':
      case 'file-del':
        break;
      case 'post-sel':
        if (event.target.classList.contains('post') || event.target.classList.contains('post_reply') || event.target.classList.contains('post_catalog')) {
          return
        }
        break;
      case 'file-sel':
        if (event.target.classList.contains('embedded-file')) {
          return
        }     
        break;
      case 'mass-post-sel-start':
        if (event.target.classList.contains('post') || event.target.classList.contains('post_reply') || event.target.classList.contains('post_catalog')) {
          clickMode = 'mass-post-sel-end'
          return
        }
        break;
      case 'mass-post-sel-end':
        if (event.target.classList.contains('post') || event.target.classList.contains('post_reply') || event.target.classList.contains('post_catalog')) {
          clickMode = 'mass-post-sel-start'
          massSelectStartPost = null;
          return
        }
        break;
    }
    massSelectStartPost = null;
    clickMode = '';
    document.documentElement.style.cursor = 'default';
    const embeddedFiles = document.querySelectorAll('.embedded-file');
    embeddedFiles.forEach(file => {
      file.classList.remove('deletion-mode');
      file.classList.remove('selection-mode');
    });

    const allPosts = document.querySelectorAll('.post, .post_reply, .post_catalog');
    allPosts.forEach(post => {
      post.classList.remove('deletion-mode');
      post.classList.remove('selection-mode');
    });
  }
}
function selectPost() {
  clickMode = clickMode !== 'post-sel' ? 'post-sel' : '';
  document.documentElement.style.cursor = clickMode ? 'crosshair' : 'default';

  const posts = document.querySelectorAll('.post, .post_reply, .post_catalog');
  posts.forEach(post => {
      post.classList.toggle('selection-mode', clickMode === 'post-sel');
  });
}
function massSelectPost() {
  clickMode = clickMode !== 'mass-post-sel-start' ? 'mass-post-sel-start' : '';
  document.documentElement.style.cursor = clickMode ? 'crosshair' : 'default';

  const posts = document.querySelectorAll('.post, .post_reply, .post_catalog');
  posts.forEach(post => {
      post.classList.toggle('selection-mode', (clickMode === 'mass-post-sel-start' || clickMode === 'mass-post-sel-end'));
  });
}
function selectFile() {
  clickMode = clickMode !== 'file-sel' ? 'file-sel' : '';
  document.documentElement.style.cursor = clickMode ? 'crosshair' : 'default';

  const embeddedFiles = document.querySelectorAll('.embedded-file');
  embeddedFiles.forEach(file => {
    file.classList.toggle('selection-mode', clickMode === 'file-sel');
  });
}
function expandImage(img) {
  img.classList.toggle('expanded');
}
function handleFileClick(currentBoard, hash) {
  switch (clickMode) {
    case 'file-del':
      window.location.href = `/${currentBoard}/deletefile=${hash}`;
      break;
    case 'file-sel':
      const fileToSelect = document.getElementById(hash);
      if (fileToSelect) {
        fileToSelect.classList.toggle('selected');
      }    
      break;
  }
}
function handlePostClick(currentBoard, hash) {
  switch (clickMode) {
    case 'post-del':
      window.location.href = `/${currentBoard}/deletepost=${hash}`;
      break;
    case 'post-sel':
      const postToSelect = document.getElementById(hash);
      if (postToSelect) {
        postToSelect.classList.toggle('selected');
      }      
      break;
    case 'mass-post-sel-start':
      massSelectStartPost = document.getElementById(hash);
      if (massSelectStartPost) {
        massSelectStartPost.classList.toggle('selected');
      }      
      break;
    case 'mass-post-sel-end':
      const massSelectEndPost = document.getElementById(hash);
      if (massSelectStartPost && massSelectEndPost) {
        selectPostsInRange(massSelectStartPost, massSelectEndPost);
      }    
      break;
  }
}
function selectPostsInRange(startPost, endPost) {
  // Get all posts in document order
  const postsToSelect = Array.from(document.querySelectorAll('.post, .post_reply, .post_catalog'));
  const startIndex = postsToSelect.indexOf(startPost);
  const endIndex = postsToSelect.indexOf(endPost);
  const [lowIndex, highIndex] = startIndex < endIndex 
    ? [startIndex, endIndex] 
    : [endIndex, startIndex];
  for (let i = lowIndex; i <= highIndex; i++) {
    postsToSelect[i].classList.add('selected');
  }
}
function handleHashClick(hash) {
  if (messageTextarea) {
      messageTextarea.value += '>>' + hash + '\n';
  }
}
function deleteSelected(alsoDeleteFilesEvenIfNotSelected) {
  const selectedPosts = document.querySelectorAll('.post.selected, .post_reply.selected, .post_catalog.selected');
  const selectedFiles = document.querySelectorAll('.embedded-file.selected');

  // Initialize the req.body structure
  const reqBody = {
    posts: {},
    files: {},
    recursiveFileDelete: alsoDeleteFilesEvenIfNotSelected
  };
function showHideSidebar() {

}
  // Helper function to add hashes to the correct board
  function addHashToBoard(obj, board, hash) {
    if (!obj[board]) {
      obj[board] = [];
    }
    obj[board].push(hash);
  }

  // Populate the posts object
  selectedPosts.forEach(post => {
    const board = post.getAttribute('board');
    const hash = post.id;
    addHashToBoard(reqBody.posts, board, hash);
  });

  // Populate the files object
  selectedFiles.forEach(file => {
    const board = file.getAttribute('board');
    const hash = file.id;
    addHashToBoard(reqBody.files, board, hash);
  });

  const requestOptions = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(reqBody)
  };
 // Send the POST request to the backend
  fetch('/deleteSelected', requestOptions)
    .then(response => response.json())
    .then(data => {
      console.log('Response:', data);
      // Check if the response contains a redirect URL
      if (data.redirectUrl) {
        window.location.href = data.redirectUrl;
      }
    })
    .catch(error => {
      console.error('Error:', error);
    });
}
function clearSelection() {
  const selectedElements = document.querySelectorAll('.selected');
  selectedElements.forEach(element => {
    element.classList.remove('selected');
  });
}
function changeTheme() {
  const themeSelector = document.getElementById('cssThemeSelector');
  window.location.href = '/function/changeTheme/' + themeSelector.options[themeSelector.selectedIndex].value;
}
document.addEventListener("DOMContentLoaded", function() {
  const embeddedFiles = document.querySelectorAll('.embedded-file');
  embeddedFiles.forEach(thisOne => {
    thisOne.addEventListener('click', function() {
      handleFileClick(thisOne.getAttribute('board'),thisOne.getAttribute('filehash'));
    });
  });
  const embeddedImages = document.querySelectorAll('.embedded-image');
  embeddedImages.forEach(thisOne => {
    if (!thisOne.closest('.post_catalog')) {
      thisOne.addEventListener('click', function() {
        expandImage(thisOne);
      });
    }
  });
  const allPosts = document.querySelectorAll('.post, .post_reply, .post_catalog');
  allPosts.forEach(thisOne => {
    thisOne.addEventListener('click', function() {
      handlePostClick(thisOne.getAttribute('board'),thisOne.getAttribute('id'));
    });
  });
  const messageTextarea = document.getElementById('postForm')?.querySelector('#message');
  const allPostHashClickables = document.querySelectorAll('.post-hash-clickable');
  allPostHashClickables.forEach(thisOne => {
    if (messageTextarea) {
      thisOne.addEventListener('click', function() {
        messageTextarea.value += '>>' + thisOne.getAttribute('hash')+'\n';
      })
    }
  })
  const deletePostButton = document.getElementById('delete-post-button');
  if (deletePostButton) {
      deletePostButton.addEventListener('click', deletePost);
  }
  const deleteFileButton = document.getElementById('delete-file-button');
  if (deleteFileButton) {
      deleteFileButton.addEventListener('click', deleteFile);
  }
  const selectPostButton = document.getElementById('select-post-button');
  if (selectPostButton) {
      selectPostButton.addEventListener('click', selectPost);
  }
  const massSelectPostButton = document.getElementById('mass-select-post-button');
  if (massSelectPostButton) {
      massSelectPostButton.addEventListener('click', massSelectPost);
  }
  const selectFileButton = document.getElementById('select-file-button');
  if (selectFileButton) {
      selectFileButton.addEventListener('click', selectFile);
  }
  const deleteSelectedButton = document.getElementById('delete-selected-button');
  if (deleteSelectedButton) {
      deleteSelectedButton.addEventListener('click', () => deleteSelected(false));
  }
  const deleteSelectedWithFilesButton = document.getElementById('delete-selected-with-files-button');
  if (deleteSelectedWithFilesButton) {
      deleteSelectedWithFilesButton.addEventListener('click', () => deleteSelected(true));
  }
  const clearSelectionButton = document.getElementById('clear-selection-button');
  if (clearSelectionButton) {
      clearSelectionButton.addEventListener('click', clearSelection);
  } 
  const cssThemeSelector = document.getElementById('cssThemeSelector');
  if (cssThemeSelector) {
      cssThemeSelector.addEventListener('change', changeTheme);
  }
  document.documentElement.addEventListener('click', exitClickModeOnce);
  const toggleSidebarButton = document.getElementById('toggleSidebar');
  if (toggleSidebarButton) {
    toggleSidebarButton.addEventListener('click', function(event) {
      event.preventDefault();

      const sidebarContent = document.getElementById('sidebarContent');
      
      if (sidebarContent.hasAttribute('hidden')) {
        sidebarContent.removeAttribute('hidden')
        toggleSidebarButton.textContent = '»';
      } else {
        sidebarContent.setAttribute('hidden', true);
        toggleSidebarButton.textContent = '«'; 
      }
      fetch('/function/toggleSidebar', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          noRedirect: true,
        })
      })
      .then(response => response.json())
      .catch(error => console.error('Error updating sidebar visibility:', error));
    });
  }

});




