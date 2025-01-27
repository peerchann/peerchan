'use-strict';
const EventTriggers = {
    onChange: (chg, board) => {
        console.log(`Local database updated for /${board}/:`);
        console.log(chg.detail);
    },
    newPostPre: (newPostPreEvent) => {
        //newPostPreEvent has two properties, .post and .board.
    },
    newPostAfter: (newPostAfterEvent) => {
        //newPostAfterEvent has two properties, .post and .board.
    }
};
export default EventTriggers;
