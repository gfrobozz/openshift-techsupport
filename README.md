# techsupport

A PoC support-style chat server / web client. Based on https://github.com/jeremyosborne/chatty

## Requirements

* node.js (assumes 0.6.0 or greater)
* npm (assumes 1.0.0 or greater)  

## OpenShift Deployment

    # create app
    $ rhc app create techsupport node

    # pull down app
    $ cd techsupport
    $ git remote add -f ts-upstream git://github.com/gfrobozz/openshift-techsupport.git
    $ git merge -Xtheirs ts-upstream/master

    # edit common/models.js admins list
    // Admin list
    var admins = [
      'futonsurfer',
      'earl'
    ]
    
    # push into production
    $ git push

## Usage

    # Users get support via
    http://yourapp.rhcloud.com

    # Admin console via
    http://yourapp.rhcloud.com/admin
