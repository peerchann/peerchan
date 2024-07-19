
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

  // Toggle the 'deletion-mode' class on embedded file elements
  const embeddedFiles = document.querySelectorAll('.embedded-file');
  embeddedFiles.forEach(file => {
    file.classList.toggle('deletion-mode', clickMode === 'file-del');
  });
}
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
    }
    clickMode = '';
    document.documentElement.style.cursor = 'default';
    // Toggle the 'deletion-mode' class off all embedded file elements
    const embeddedFiles = document.querySelectorAll('.embedded-file');
    embeddedFiles.forEach(file => {
      file.classList.remove('deletion-mode');
      file.classList.remove('selection-mode');
    });

    // Toggle the 'deletion-mode' class off all post elements
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
});




