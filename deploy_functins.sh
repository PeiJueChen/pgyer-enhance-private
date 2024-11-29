echo "functions Deploying..."
firebase deploy --only functions --project aigensstoretest


# The following functions are found in your project but do not exist in your local source code:
        # applePaySession(us-central1)
        # batchStoresStatus(us-central1)
        # breadtalkApplePaySession(us-central1)
        # eftApplePaySession(us-central1)
        # epsonPoll(us-central1)
        # genkiApplePaySession(us-central1)
        # genkiApplePaySession2(us-central1)
        # starPoll(us-central1)

# If you are renaming a function or changing its region, it is recommended that you create the new function first before deleting the old one to prevent event loss. For more info, visit https://firebase.google.com/docs/functions/manage-functions#modify

# ? Would you like to proceed with deletion? Selecting no will continue the rest of the deployments


## Must select NO
