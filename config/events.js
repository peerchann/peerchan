'use-strict';
const EventTriggers = {
    //this can be modified to add custom behavior based on the post/file data (eg. sending it to another service to check the contents and delete if desired)
    onChange: (chg, board) => {
        console.log(`Local database updated for /${board}/:`); //todo: configurable colors?
        console.log(chg);
    }
};
export default EventTriggers;
